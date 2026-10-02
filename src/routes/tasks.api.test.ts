import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { db, pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';

const stamp = Date.now();
const password = 'password12';

type Session = { token: string; workspaceId: string; userId: string };
type Item = { id: string; text: string; checked: boolean; checkedBy: string | null; position: number };

describe('task lists API', () => {
  let app: Express;
  let dbReady = false;
  let owner: Session;
  let viewer: Session;
  let outsider: Session;
  let workspaceId: string;

  async function register(label: string): Promise<Session> {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `tasks-${label}-${stamp}@example.com`, password });
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

  async function createList(session: Session, body: object = {}) {
    const res = await as(session).post(`/api/workspaces/${workspaceId}/task-lists`, body);
    expect(res.status).toBe(201);
    return res.body.data.list as { id: string; title: string; mode: string; visibility: string; editable: boolean };
  }

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping task lists API tests: database unavailable', error);
      return;
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();

    owner = await register('owner');
    viewer = await register('viewer');
    outsider = await register('outsider');
    workspaceId = owner.workspaceId;

    const invite = await as(owner).post(`/api/workspaces/${workspaceId}/members`, {
      email: `tasks-viewer-${stamp}@example.com`,
      role: 'viewer',
    });
    expect(invite.status).toBe(201);
    const inviteToken = String(invite.body.data.invite.inviteUrl).split('/invite/')[1];
    const accepted = await as(viewer).post(`/api/invites/${inviteToken}/accept`);
    expect(accepted.status).toBe(201);
  });

  it('creates a list, bulk-adds items and reports counts', async () => {
    if (!dbReady) return;
    const list = await createList(owner, { title: '  Packing  ' });
    expect(list.title).toBe('Packing');
    expect(list.mode).toBe('checklist');
    expect(list.visibility).toBe('private');
    expect(list.editable).toBe(true);

    const added = await as(owner).post(`/api/task-lists/${list.id}/items`, {
      texts: ['Passport', '  ', ' Charger ', 'Toothbrush'],
    });
    expect(added.status).toBe(201);
    expect(added.body.data.items.map((item: Item) => item.text)).toEqual(['Passport', 'Charger', 'Toothbrush']);
    expect(added.body.data.list.itemCount).toBe(3);

    const single = await as(owner).post(`/api/task-lists/${list.id}/items`, { text: 'Socks' });
    expect(single.body.data.items.at(-1).text).toBe('Socks');
    expect(single.body.data.items.at(-1).position).toBe(3);

    const both = await as(owner).post(`/api/task-lists/${list.id}/items`, { text: 'a', texts: ['b'] });
    expect(both.status).toBe(400);

    const lists = await as(owner).get(`/api/workspaces/${workspaceId}/task-lists`);
    const summary = lists.body.data.lists.find((entry: { id: string }) => entry.id === list.id);
    expect(summary.itemCount).toBe(4);
    expect(summary.checkedCount).toBe(0);
  });

  it('checks, unchecks, reorders, edits and resets items', async () => {
    if (!dbReady) return;
    const list = await createList(owner, { title: 'Run' });
    const added = await as(owner).post(`/api/task-lists/${list.id}/items`, { texts: ['one', 'two', 'three'] });
    const [one, two, three] = added.body.data.items as Item[];

    const checked = await as(owner).patch(`/api/task-list-items/${one.id}`, { checked: true });
    expect(checked.status).toBe(200);
    expect(checked.body.data.item.checked).toBe(true);
    expect(checked.body.data.item.checkedBy).toBe(owner.userId);

    const view = await as(owner).get(`/api/task-lists/${list.id}`);
    expect(view.body.data.list.checkedCount).toBe(1);
    expect(view.body.data.list.lastRunAt).not.toBeNull();

    const unchecked = await as(owner).patch(`/api/task-list-items/${one.id}`, { checked: false });
    expect(unchecked.body.data.item.checked).toBe(false);
    expect(unchecked.body.data.item.checkedBy).toBeNull();

    const empty = await as(owner).patch(`/api/task-list-items/${one.id}`, {});
    expect(empty.status).toBe(400);

    const renamed = await as(owner).patch(`/api/task-list-items/${two.id}`, { text: ' TWO ' });
    expect(renamed.body.data.item.text).toBe('TWO');

    const reordered = await as(owner).put(`/api/task-lists/${list.id}/items/order`, {
      itemIds: [three.id, one.id, two.id],
    });
    expect(reordered.body.data.items.map((item: Item) => item.id)).toEqual([three.id, one.id, two.id]);

    const partial = await as(owner).put(`/api/task-lists/${list.id}/items/order`, { itemIds: [one.id] });
    expect(partial.status).toBe(400);
    expect(partial.body.error).toBe('INVALID_ORDER');

    await as(owner).patch(`/api/task-list-items/${one.id}`, { checked: true });
    await as(owner).patch(`/api/task-list-items/${two.id}`, { checked: true });
    const reset = await as(owner).post(`/api/task-lists/${list.id}/reset`);
    expect(reset.status).toBe(200);
    expect(reset.body.data.items.every((item: Item) => !item.checked)).toBe(true);

    const removed = await as(owner).del(`/api/task-list-items/${three.id}`);
    expect(removed.status).toBe(200);
    const after = await as(owner).get(`/api/task-lists/${list.id}`);
    expect(after.body.data.items).toHaveLength(2);
  });

  it('hides private lists and limits shared-list changes', async () => {
    if (!dbReady) return;
    const secret = await createList(owner, { title: 'Secret' });
    const hidden = await as(viewer).get(`/api/task-lists/${secret.id}`);
    expect(hidden.status).toBe(404);
    const viewerLists = await as(viewer).get(`/api/workspaces/${workspaceId}/task-lists`);
    expect(viewerLists.body.data.lists.map((entry: { id: string }) => entry.id)).not.toContain(secret.id);

    const shared = await createList(owner, { title: 'Shared', visibility: 'workspace' });
    const added = await as(owner).post(`/api/task-lists/${shared.id}/items`, { texts: ['milk'] });
    const [milk] = added.body.data.items as Item[];

    const seen = await as(viewer).get(`/api/task-lists/${shared.id}`);
    expect(seen.status).toBe(200);
    expect(seen.body.data.list.editable).toBe(false);

    const ticked = await as(viewer).patch(`/api/task-list-items/${milk.id}`, { checked: true });
    expect(ticked.status).toBe(200);
    expect(ticked.body.data.item.checkedBy).toBe(viewer.userId);

    const viewerAdd = await as(viewer).post(`/api/task-lists/${shared.id}/items`, { text: 'eggs' });
    expect(viewerAdd.status).toBe(403);
    const viewerEdit = await as(viewer).patch(`/api/task-list-items/${milk.id}`, { text: 'oat milk' });
    expect(viewerEdit.status).toBe(403);
    const viewerRename = await as(viewer).patch(`/api/task-lists/${shared.id}`, { title: 'Mine' });
    expect(viewerRename.status).toBe(403);
    const viewerDelete = await as(viewer).del(`/api/task-lists/${shared.id}`);
    expect(viewerDelete.status).toBe(403);

    const outsiderGet = await as(outsider).get(`/api/task-lists/${shared.id}`);
    expect(outsiderGet.status).toBe(403);
    const outsiderTick = await as(outsider).patch(`/api/task-list-items/${milk.id}`, { checked: false });
    expect(outsiderTick.status).toBe(403);
    const outsiderList = await as(outsider).get(`/api/workspaces/${workspaceId}/task-lists`);
    expect(outsiderList.status).toBe(403);
  });

  it('turns a note’s list lines into a new private checklist', async () => {
    if (!dbReady) return;
    const created = await as(owner).post(`/api/workspaces/${workspaceId}/notes`, {
      title: 'Trip prep',
      visibility: 'workspace',
    });
    const noteId = created.body.data.note.id as string;
    const content = '# Trip\n\nIntro text.\n\n- **Passport**\n- [x] Charger\n1. Tickets\n\n```\n- not this\n```\n';
    const fresh = await as(owner).get(`/api/notes/${noteId}`);
    await as(owner).put(`/api/notes/${noteId}/content`, { content, hash: fresh.body.data.hash });

    const sent = await as(owner).post('/api/task-lists/from-note', { noteId });
    expect(sent.status).toBe(201);
    expect(sent.body.data.list.title).toBe('Trip prep');
    expect(sent.body.data.list.visibility).toBe('private');
    expect(sent.body.data.items.map((item: Item) => [item.text, item.checked])).toEqual([
      ['Passport', false],
      ['Charger', true],
      ['Tickets', false],
    ]);
    expect(sent.body.data.list.checkedCount).toBe(1);

    const note = await as(owner).get(`/api/notes/${noteId}`);
    expect(note.body.data.content).toBe(content);

    // A viewer who can see a shared note gets their own private copy.
    const viewerCopy = await as(viewer).post('/api/task-lists/from-note', { noteId });
    expect(viewerCopy.status).toBe(201);
    expect(viewerCopy.body.data.list.authorId).toBe(viewer.userId);

    const prose = await as(owner).post(`/api/workspaces/${workspaceId}/notes`, { title: 'Prose' });
    const proseId = prose.body.data.note.id as string;
    const proseBody = await as(owner).get(`/api/notes/${proseId}`);
    await as(owner).put(`/api/notes/${proseId}/content`, { content: 'Just words.', hash: proseBody.body.data.hash });
    const empty = await as(owner).post('/api/task-lists/from-note', { noteId: proseId });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe('NO_LIST_ITEMS');

    const hidden = await as(viewer).post('/api/task-lists/from-note', { noteId: proseId });
    expect(hidden.status).toBe(404);
    const bad = await as(owner).post('/api/task-lists/from-note', { noteId: 'nope' });
    expect(bad.status).toBe(400);
  });

  it('soft-deletes lists', async () => {
    if (!dbReady) return;
    const list = await createList(owner, { title: 'Temp' });
    const renamed = await as(owner).patch(`/api/task-lists/${list.id}`, { title: 'Temporary', icon: '🧳' });
    expect(renamed.body.data.list.title).toBe('Temporary');
    expect(renamed.body.data.list.icon).toBe('🧳');

    const deleted = await as(owner).del(`/api/task-lists/${list.id}`);
    expect(deleted.status).toBe(200);
    const gone = await as(owner).get(`/api/task-lists/${list.id}`);
    expect(gone.status).toBe(404);
    const missing = await as(owner).get('/api/task-lists/not-a-uuid');
    expect(missing.status).toBe(404);
  });
});
