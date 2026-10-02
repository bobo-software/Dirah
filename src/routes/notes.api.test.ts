import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { db, pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { workspaces } from '../db/schemas';

const stamp = Date.now();
const password = 'password12';

type Session = { token: string; workspaceId: string; userId: string };

describe('notes API', () => {
  let app: Express;
  let dbReady = false;
  let owner: Session;
  let member: Session;
  let outsider: Session;
  let workspaceId: string;

  async function register(label: string): Promise<Session> {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `notes-${label}-${stamp}@example.com`, password });
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
    };
  }

  async function createNote(session: Session, body: object = {}) {
    const res = await as(session).post(`/api/workspaces/${workspaceId}/notes`, body);
    expect(res.status).toBe(201);
    return res.body.data.note as {
      id: string;
      title: string;
      kind: string;
      visibility: string;
      parentId: string | null;
    };
  }

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping notes API tests: database unavailable', error);
      return;
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();

    owner = await register('owner');
    member = await register('member');
    outsider = await register('outsider');
    workspaceId = owner.workspaceId;

    const invite = await as(owner).post(`/api/workspaces/${workspaceId}/members`, {
      email: `notes-member-${stamp}@example.com`,
      role: 'viewer',
    });
    expect(invite.status).toBe(201);
    const inviteToken = String(invite.body.data.invite.inviteUrl).split('/invite/')[1];
    const accepted = await as(member).post(`/api/invites/${inviteToken}/accept`);
    expect(accepted.status).toBe(201);
  });

  it('lets the author create, write and read a note, with hash conflicts', async () => {
    if (!dbReady) return;
    const note = await createNote(owner, { title: '  Ideas  ', icon: '💡' });
    expect(note.visibility).toBe('private');

    const empty = await as(owner).get(`/api/notes/${note.id}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data.content).toBe('');
    expect(empty.body.data.note.title).toBe('Ideas');
    expect(empty.body.data.note.icon).toBe('💡');
    expect(empty.body.data.note.editable).toBe(true);

    const saved = await as(owner).put(`/api/notes/${note.id}/content`, {
      content: '# Plan\n\n- [ ] zebracorn launch',
      hash: empty.body.data.hash,
    });
    expect(saved.status).toBe(200);

    const stale = await as(owner).put(`/api/notes/${note.id}/content`, {
      content: 'other',
      hash: empty.body.data.hash,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('HASH_MISMATCH');

    const searched = await as(owner).get(`/api/workspaces/${workspaceId}/notes?q=zebracorn`);
    expect(searched.body.data.notes.map((n: { id: string }) => n.id)).toEqual([note.id]);
    expect(searched.body.data.notes[0].excerpt).toContain('zebracorn');

    const pages = await as(owner).get(`/api/workspaces/${workspaceId}/pages?q=zebracorn`);
    expect(pages.status).toBe(200);
    expect(pages.body.data.pages).toHaveLength(0);

    const pinned = await as(owner).patch(`/api/notes/${note.id}`, { pinned: true });
    expect(pinned.body.data.note.pinnedAt).not.toBeNull();
  });

  it('keeps private notes private and shared notes read-only for other members', async () => {
    if (!dbReady) return;
    const note = await createNote(owner, { title: 'Secret' });
    const memberApi = as(member);

    const hiddenList = await memberApi.get(`/api/workspaces/${workspaceId}/notes`);
    expect(hiddenList.status).toBe(200);
    expect(hiddenList.body.data.notes.some((n: { id: string }) => n.id === note.id)).toBe(false);
    expect((await memberApi.get(`/api/notes/${note.id}`)).status).toBe(404);
    expect((await memberApi.patch(`/api/notes/${note.id}`, { title: 'x' })).status).toBe(404);
    expect((await memberApi.del(`/api/notes/${note.id}`)).status).toBe(404);

    const shared = await as(owner).patch(`/api/notes/${note.id}`, { visibility: 'workspace' });
    expect(shared.status).toBe(200);

    const read = await memberApi.get(`/api/notes/${note.id}`);
    expect(read.status).toBe(200);
    expect(read.body.data.note.editable).toBe(false);
    const sharedList = await memberApi.get(`/api/workspaces/${workspaceId}/notes?scope=shared`);
    expect(sharedList.body.data.notes.some((n: { id: string }) => n.id === note.id)).toBe(true);
    expect((await memberApi.patch(`/api/notes/${note.id}`, { title: 'x' })).status).toBe(403);
    expect((await memberApi.put(`/api/notes/${note.id}/content`, { content: 'x' })).status).toBe(403);

    // Viewers may still keep their own notes; the owner cannot see them.
    const own = await createNote(member, { title: 'Mine' });
    expect((await as(owner).get(`/api/notes/${own.id}`)).status).toBe(404);

    expect((await as(outsider).get(`/api/workspaces/${workspaceId}/notes`)).status).toBe(403);
    expect((await as(outsider).get(`/api/notes/${note.id}`)).status).toBe(403);
    expect((await as(owner).get('/api/notes/not-a-uuid')).status).toBe(404);
  });

  it('nests notes with cycle checks and one visibility per tree', async () => {
    if (!dbReady) return;
    const api = as(owner);
    const root = await createNote(owner, { title: 'Root' });
    const child = await createNote(owner, { title: 'Child', parentId: root.id });
    const grandchild = await createNote(owner, { title: 'Grandchild', parentId: child.id });
    expect(child.parentId).toBe(root.id);

    expect((await api.patch(`/api/notes/${root.id}`, { parentId: grandchild.id })).body.error).toBe('CYCLE');
    expect((await api.patch(`/api/notes/${root.id}`, { parentId: root.id })).status).toBe(400);

    const conflict = await api.post(`/api/workspaces/${workspaceId}/notes`, {
      parentId: root.id,
      visibility: 'workspace',
    });
    expect(conflict.status).toBe(400);
    expect(conflict.body.error).toBe('VISIBILITY_CONFLICT');
    expect((await api.patch(`/api/notes/${child.id}`, { visibility: 'workspace' })).status).toBe(400);

    const shared = await api.patch(`/api/notes/${root.id}`, { visibility: 'workspace' });
    expect(shared.status).toBe(200);
    const memberView = await as(member).get(`/api/notes/${grandchild.id}`);
    expect(memberView.status).toBe(200);
    expect(memberView.body.data.note.visibility).toBe('workspace');

    const privateRoot = await createNote(owner, { title: 'Private root' });
    const moved = await api.patch(`/api/notes/${child.id}`, { parentId: privateRoot.id });
    expect(moved.body.error).toBe('VISIBILITY_CONFLICT');

    const memberNote = await createNote(member);
    const foreignParent = await api.post(`/api/workspaces/${workspaceId}/notes`, { parentId: memberNote.id });
    expect(foreignParent.body.error).toBe('INVALID_PARENT');

    const madePrivate = await api.patch(`/api/notes/${root.id}`, { visibility: 'private' });
    expect(madePrivate.status).toBe(200);
    expect((await as(member).get(`/api/notes/${grandchild.id}`)).status).toBe(404);
  });

  it('manages workspace tags and filters notes by tag', async () => {
    if (!dbReady) return;
    const api = as(owner);
    const created = await api.post(`/api/workspaces/${workspaceId}/note-tags`, { name: 'Work', color: 'blue' });
    expect(created.status).toBe(201);
    const tagId = created.body.data.tag.id as string;

    const dup = await api.post(`/api/workspaces/${workspaceId}/note-tags`, { name: ' work ' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('TAG_EXISTS');

    const tagged = await createNote(owner, { title: 'Tagged' });
    const untagged = await createNote(owner, { title: 'Untagged' });
    const set = await api.put(`/api/notes/${tagged.id}/tags`, { tagIds: [tagId, tagId] });
    expect(set.status).toBe(200);
    expect(set.body.data.note.tagIds).toEqual([tagId]);

    const filtered = await api.get(`/api/workspaces/${workspaceId}/notes?tagId=${tagId}`);
    const ids = filtered.body.data.notes.map((n: { id: string }) => n.id);
    expect(ids).toContain(tagged.id);
    expect(ids).not.toContain(untagged.id);

    const otherTag = await as(outsider).post(`/api/workspaces/${outsider.workspaceId}/note-tags`, { name: 'Elsewhere' });
    const foreign = await api.put(`/api/notes/${tagged.id}/tags`, { tagIds: [otherTag.body.data.tag.id] });
    expect(foreign.body.error).toBe('INVALID_TAG');

    expect((await as(member).patch(`/api/note-tags/${tagId}`, { name: 'Nope' })).status).toBe(403);
    const renamed = await api.patch(`/api/note-tags/${tagId}`, { name: 'Projects' });
    expect(renamed.body.data.tag.name).toBe('Projects');

    expect((await api.del(`/api/note-tags/${tagId}`)).status).toBe(200);
    const after = await api.get(`/api/notes/${tagged.id}`);
    expect(after.body.data.note.tagIds).toEqual([]);
  });

  it('trashes subtrees, restores, and permanently deletes', async () => {
    if (!dbReady) return;
    const api = as(owner);
    const root = await createNote(owner, { title: 'Trash root' });
    const child = await createNote(owner, { title: 'Trash child', parentId: root.id });

    expect((await api.del(`/api/notes/${root.id}/permanent`)).body.error).toBe('NOT_TRASHED');
    expect((await api.del(`/api/notes/${root.id}`)).status).toBe(200);
    expect((await api.get(`/api/notes/${child.id}`)).status).toBe(404);

    const trash = await api.get(`/api/workspaces/${workspaceId}/notes?trashed=1`);
    const trashed = trash.body.data.notes.map((n: { id: string }) => n.id);
    expect(trashed).toEqual(expect.arrayContaining([root.id, child.id]));

    const restoredChild = await api.post(`/api/notes/${child.id}/restore`);
    expect(restoredChild.status).toBe(200);
    expect(restoredChild.body.data.note.parentId).toBeNull();

    const removed = await api.del(`/api/notes/${root.id}/permanent`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.ids).toEqual([root.id]);
    expect((await api.get(`/api/notes/${child.id}`)).status).toBe(200);
  });

  it('keeps kanban cards as notes and leaves placed notes in the tree', async () => {
    if (!dbReady) return;
    const api = as(owner);
    const board = await createNote(owner, { title: 'Kanban', kind: 'kanban' });
    expect(board).toMatchObject({ title: 'Kanban', kind: 'kanban', parentId: null });

    const plain = await createNote(owner, { title: 'Plain' });
    expect(plain).toMatchObject({ kind: 'note' });

    const loaded = await api.get(`/api/notes/${board.id}/board`);
    expect(loaded.status).toBe(200);
    const columns = loaded.body.data.columns as { id: string; title: string; cards: unknown[] }[];
    expect(columns.map((column) => column.title)).toEqual(['To do', 'Doing', 'Done']);
    expect(columns.every((column) => column.cards.length === 0)).toBe(true);

    const added = await api.post(`/api/notes/${board.id}/cards`, {
      columnId: columns[0].id,
      title: 'Sprint',
    });
    expect(added.status).toBe(201);
    const sprint = added.body.data.columns[0].cards[0].note as { id: string; parentId: string };
    expect(sprint.parentId).toBe(board.id);

    const home = await createNote(owner, { title: 'Home' });
    const elsewhere = await createNote(owner, { title: 'Elsewhere', parentId: home.id });
    const placed = await api.post(`/api/notes/${board.id}/cards`, {
      columnId: columns[0].id,
      noteId: elsewhere.id,
    });
    expect(placed.status).toBe(201);
    const elsewhereAfter = await api.get(`/api/notes/${elsewhere.id}`);
    expect(elsewhereAfter.body.data.note.parentId).toBe(home.id);

    const moved = await api.patch('/api/kanban-cards', {
      boardId: board.id,
      noteId: elsewhere.id,
      columnId: columns[1].id,
      position: 0,
    });
    expect(moved.status).toBe(200);
    const doing = (moved.body.data.columns as { title: string; cards: { noteId: string }[] }[]).find(
      (column) => column.title === 'Doing'
    );
    expect(doing?.cards.map((card) => card.noteId)).toEqual([elsewhere.id]);
    expect((await api.get(`/api/notes/${elsewhere.id}`)).body.data.note.parentId).toBe(home.id);

    const duplicate = await api.post(`/api/notes/${board.id}/cards`, {
      columnId: columns[1].id,
      noteId: elsewhere.id,
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe('ALREADY_PLACED');

    expect((await api.del(`/api/notes/${elsewhere.id}`)).status).toBe(200);
    const afterTrash = await api.get(`/api/notes/${board.id}/board`);
    const remaining = (afterTrash.body.data.columns as { cards: { noteId: string }[] }[]).flatMap((column) =>
      column.cards.map((card) => card.noteId)
    );
    expect(remaining).toEqual([sprint.id]);
    expect((await api.get(`/api/notes/${home.id}`)).status).toBe(200);

    const shared = await api.patch(`/api/notes/${board.id}`, { visibility: 'workspace' });
    expect(shared.status).toBe(200);
    const secret = await createNote(owner, { title: 'Still private' });
    const rejected = await api.post(`/api/notes/${board.id}/cards`, {
      columnId: columns[0].id,
      noteId: secret.id,
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toBe('VISIBILITY_CONFLICT');

    const memberView = await as(member).get(`/api/notes/${board.id}/board`);
    expect(memberView.status).toBe(200);
    expect((await as(member).post(`/api/notes/${board.id}/cards`, { columnId: columns[0].id, title: 'Nope' })).status).toBe(403);

    const reversed = await api.put(`/api/notes/${board.id}/columns/order`, {
      columnIds: [...columns].reverse().map((column) => column.id),
    });
    expect(reversed.status).toBe(200);
    expect((reversed.body.data.columns as { title: string }[]).map((column) => column.title)).toEqual([
      'Done',
      'Doing',
      'To do',
    ]);
  });

  it('refuses note writes in encrypted workspaces until Phase 5', async () => {
    if (!dbReady) return;
    const created = await as(outsider).post('/api/workspaces', { name: `Sealed ${stamp}` });
    expect(created.status).toBe(201);
    const sealedId = created.body.data.workspace.id as string;
    await db.update(workspaces).set({ encrypted: true }).where(eq(workspaces.id, sealedId));

    const res = await as(outsider).post(`/api/workspaces/${sealedId}/notes`, { title: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('NOTES_ENCRYPTION_PENDING');
  });
});
