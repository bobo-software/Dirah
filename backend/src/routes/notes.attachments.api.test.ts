import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { db, pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';

const stamp = Date.now();
const password = 'password12';

/** A tiny valid PNG header; `seed` makes each image's bytes (and hash) unique. */
function png(seed: string): Buffer {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`${seed}-${stamp}`)]);
}

type Session = { token: string; workspaceId: string; userId: string };

describe('note attachments API', () => {
  let app: Express;
  let dbReady = false;
  let owner: Session;
  let viewer: Session;
  let workspaceId: string;

  async function register(label: string): Promise<Session> {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `note-files-${label}-${stamp}@example.com`, password });
    expect(res.status).toBe(201);
    return {
      token: res.body.data.tokens.accessToken as string,
      workspaceId: res.body.data.workspace.id as string,
      userId: res.body.data.user.id as string,
    };
  }

  function as(session: Session) {
    const auth = { Authorization: `Bearer ${session.token}` };
    return {
      get: (url: string) => request(app).get(url).set(auth),
      post: (url: string, body: object = {}) => request(app).post(url).set(auth).send(body),
      patch: (url: string, body: object) => request(app).patch(url).set(auth).send(body),
      put: (url: string, body: object) => request(app).put(url).set(auth).send(body),
      del: (url: string) => request(app).delete(url).set(auth),
      upload: (url: string, body: Buffer, type = 'image/png') =>
        request(app).post(url).set(auth).set('Content-Type', type).send(body),
    };
  }

  async function createNote(session: Session, body: object = {}): Promise<{ id: string }> {
    const res = await as(session).post(`/api/workspaces/${workspaceId}/notes`, body);
    expect(res.status).toBe(201);
    return res.body.data.note;
  }

  async function attach(session: Session, noteId: string, seed: string): Promise<{ id: string; url: string }> {
    const res = await as(session).upload(`/api/notes/${noteId}/attachments`, png(seed));
    expect(res.status).toBe(201);
    return res.body.data.blob;
  }

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping note attachments API tests: database unavailable', error);
      // Set ALLOW_DB_SKIP=1 to run without Postgres; otherwise a missing database must fail, not pass.
      if (process.env.ALLOW_DB_SKIP !== '1') throw error;
      return;
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();

    owner = await register('owner');
    viewer = await register('viewer');
    workspaceId = owner.workspaceId;

    const invite = await as(owner).post(`/api/workspaces/${workspaceId}/members`, {
      email: `note-files-viewer-${stamp}@example.com`,
      role: 'viewer',
    });
    expect(invite.status).toBe(201);
    const inviteToken = String(invite.body.data.invite.inviteUrl).split('/invite/')[1];
    const accepted = await as(viewer).post(`/api/invites/${inviteToken}/accept`);
    expect(accepted.status).toBe(201);
  });

  it('stores an image for the author, checked by its bytes, not its content-type', async () => {
    if (!dbReady) return;
    const note = await createNote(owner, { title: 'Photos' });
    const blob = await attach(owner, note.id, 'first');
    expect(blob.url).toBe(`/api/blobs/${blob.id}`);

    const read = await as(owner).get(blob.url);
    expect(read.status).toBe(200);
    expect(read.headers['content-type']).toBe('image/png');

    const fake = await as(owner).upload(`/api/notes/${note.id}/attachments`, Buffer.from('not an image'), 'image/png');
    expect(fake.status).toBe(415);
    expect(fake.body.error).toBe('UNSUPPORTED_MEDIA_TYPE');

    const svg = await as(owner).upload(`/api/notes/${note.id}/attachments`, Buffer.from('<svg/>'), 'image/svg+xml');
    expect(svg.status).toBe(415);

    const empty = await as(owner).upload(`/api/notes/${note.id}/attachments`, Buffer.alloc(0));
    expect(empty.status).toBe(400);
  });

  it('keeps a private note’s images private until the note is shared', async () => {
    if (!dbReady) return;
    const note = await createNote(owner, { title: 'Private album' });
    const blob = await attach(owner, note.id, 'private');

    expect((await as(viewer).get(blob.url)).status).toBe(404);
    expect((await as(viewer).get(`/api/workspaces/${workspaceId}/blobs/${blob.id}`)).status).toBe(404);
    // Other members can't delete it either, even workspace editors (the owner is the author here).
    expect((await as(viewer).del(blob.url)).status).toBe(404);

    const shared = await as(owner).patch(`/api/notes/${note.id}`, { visibility: 'workspace' });
    expect(shared.status).toBe(200);
    expect((await as(viewer).get(blob.url)).status).toBe(200);

    const trashed = await as(owner).del(`/api/notes/${note.id}`);
    expect(trashed.status).toBe(200);
    expect((await as(viewer).get(blob.url)).status).toBe(404);
    expect((await as(owner).get(blob.url)).status).toBe(200);
  });

  it('lets only the note’s author attach: viewers to their own notes, nobody to someone else’s', async () => {
    if (!dbReady) return;
    const own = await createNote(viewer, { title: 'Viewer scrapbook' });
    await attach(viewer, own.id, 'viewer');

    const private_ = await createNote(owner, { title: 'Not yours' });
    expect((await as(viewer).upload(`/api/notes/${private_.id}/attachments`, png('x'))).status).toBe(404);

    const sharedNote = await createNote(owner, { title: 'Shared, read-only', visibility: 'workspace' });
    expect((await as(viewer).upload(`/api/notes/${sharedNote.id}/attachments`, png('y'))).status).toBe(403);
  });

  it('never ties a workspace (ticket) image to a note', async () => {
    if (!dbReady) return;
    const bytes = png('ticket');
    const ticketUpload = await as(owner).upload(`/api/workspaces/${workspaceId}/blobs`, bytes);
    expect(ticketUpload.status).toBe(201);
    const ticketBlob = ticketUpload.body.data.blob as { id: string; url: string };

    // The same bytes attached to a private note get their own blob.
    const note = await createNote(owner, { title: 'Copy of a ticket image' });
    const noteBlob = await attach(owner, note.id, 'ticket');
    expect(noteBlob.id).not.toBe(ticketBlob.id);

    // Pasting the ticket image's link into a private note doesn't make it private.
    const body = await as(owner).get(`/api/notes/${note.id}`);
    const saved = await as(owner).put(`/api/notes/${note.id}/content`, {
      content: `![shot](${ticketBlob.url})`,
      hash: body.body.data.hash,
    });
    expect(saved.status).toBe(200);
    expect((await as(viewer).get(ticketBlob.url)).status).toBe(200);

    // And a later ticket upload of the note image's bytes doesn't reuse the note's blob.
    const again = await as(owner).upload(`/api/workspaces/${workspaceId}/blobs`, png('ticket'));
    expect(again.body.data.blob.id).not.toBe(noteBlob.id);
  });

  it('follows an image moved into another of the author’s notes', async () => {
    if (!dbReady) return;
    const source = await createNote(owner, { title: 'Draft' });
    const blob = await attach(owner, source.id, 'moved');
    const target = await createNote(owner, { title: 'Published', visibility: 'workspace' });

    expect((await as(viewer).get(blob.url)).status).toBe(404);
    const body = await as(owner).get(`/api/notes/${target.id}`);
    const saved = await as(owner).put(`/api/notes/${target.id}/content`, {
      content: `Intro\n\n![chart](${blob.url})\n\nOutro`,
      hash: body.body.data.hash,
    });
    expect(saved.status).toBe(200);
    expect((await as(viewer).get(blob.url)).status).toBe(200);
  });

  it('doesn’t let another member link someone else’s note image into their own note', async () => {
    if (!dbReady) return;
    const secret = await createNote(owner, { title: 'Secret' });
    const blob = await attach(owner, secret.id, 'secret');

    const mine = await createNote(viewer, { title: 'Trying', visibility: 'workspace' });
    const body = await as(viewer).get(`/api/notes/${mine.id}`);
    await as(viewer).put(`/api/notes/${mine.id}/content`, {
      content: `![x](${blob.url})`,
      hash: body.body.data.hash,
    });
    expect((await as(viewer).get(blob.url)).status).toBe(404);
  });
});
