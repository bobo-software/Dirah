import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { db, pool } from '../db';
import { workspaces } from '../db/schemas';
import { runPendingMigrations } from '../db/migrationRunner';

const stamp = Date.now();
const password = 'password12';

type Session = { token: string; workspaceId: string; userId: string };
type Status = { id: string; name: string; category: string; position: number };
type Group = { id: string; name: string; position: number };
type Ticket = {
  id: string;
  key: string;
  number: number;
  groupId: string;
  statusId: string;
  title: string;
  priority: string;
  dueDate: string | null;
  labels: string[];
  position: number;
  statusPosition: number;
  assigneeIds: string[];
};
type BoardView = {
  board: { id: string; key: string; name: string; ticketCount: number; openCount: number };
  statuses: Status[];
  groups: Group[];
  tickets: Ticket[];
};

describe('tickets API', () => {
  let app: Express;
  let dbReady = false;
  let owner: Session;
  let editor: Session;
  let viewer: Session;
  let outsider: Session;
  let workspaceId: string;

  async function register(label: string): Promise<Session> {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `tickets-${label}-${stamp}@example.com`, password });
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
      del: (url: string, body: object = {}) => request(app).delete(url).set(auth).send(body),
    };
  }

  async function invite(session: Session, label: string, role: 'editor' | 'viewer') {
    const res = await as(owner).post(`/api/workspaces/${workspaceId}/members`, {
      email: `tickets-${label}-${stamp}@example.com`,
      role,
    });
    expect(res.status).toBe(201);
    const token = String(res.body.data.invite.inviteUrl).split('/invite/')[1];
    expect((await as(session).post(`/api/invites/${token}/accept`)).status).toBe(201);
  }

  async function createBoard(body: object = {}): Promise<BoardView> {
    const res = await as(owner).post(`/api/workspaces/${workspaceId}/ticket-boards`, body);
    expect(res.status).toBe(201);
    return res.body.data as BoardView;
  }

  async function createTicket(boardId: string, body: object): Promise<Ticket> {
    const res = await as(owner).post(`/api/ticket-boards/${boardId}/tickets`, body);
    expect(res.status).toBe(201);
    return res.body.data.ticket as Ticket;
  }

  async function board(boardId: string): Promise<BoardView> {
    const res = await as(owner).get(`/api/ticket-boards/${boardId}`);
    expect(res.status).toBe(200);
    return res.body.data as BoardView;
  }

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping tickets API tests: database unavailable', error);
      // Set ALLOW_DB_SKIP=1 to run without Postgres; otherwise a missing database must fail, not pass.
      if (process.env.ALLOW_DB_SKIP !== '1') throw error;
      return;
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();

    owner = await register('owner');
    editor = await register('editor');
    viewer = await register('viewer');
    outsider = await register('outsider');
    workspaceId = owner.workspaceId;
    await invite(editor, 'editor', 'editor');
    await invite(viewer, 'viewer', 'viewer');
  });

  it('creates a board with default statuses, a group, and a derived key', async () => {
    if (!dbReady) return;
    const view = await createBoard({ name: 'Product roadmap' });
    expect(view.board.key).toBe('PR');
    expect(view.statuses.map((status) => status.name)).toEqual(['To do', 'In progress', 'Blocked', 'Done']);
    expect(view.statuses.map((status) => status.category)).toEqual(['todo', 'doing', 'doing', 'done']);
    expect(view.groups.map((group) => group.name)).toEqual(['Backlog']);

    const again = await createBoard({ name: 'Public relations' });
    expect(again.board.key).toBe('PR2');

    const clash = await as(owner).post(`/api/workspaces/${workspaceId}/ticket-boards`, { name: 'x', key: 'pr' });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toBe('BOARD_KEY_TAKEN');

    const bad = await as(owner).post(`/api/workspaces/${workspaceId}/ticket-boards`, { key: '1AB' });
    expect(bad.status).toBe(400);

    const list = await as(viewer).get(`/api/workspaces/${workspaceId}/ticket-boards`);
    expect(list.status).toBe(200);
    expect(list.body.data.boards.map((entry: { key: string }) => entry.key)).toEqual(
      expect.arrayContaining(['PR', 'PR2'])
    );
  });

  it('numbers tickets sequentially and resolves keys', async () => {
    if (!dbReady) return;
    const view = await createBoard({ name: 'Sequence', key: 'SEQ' });
    const first = await createTicket(view.board.id, { title: 'First' });
    const second = await createTicket(view.board.id, { title: ' Second ', priority: 'high', labels: ['ui', 'UI', ' api '] });
    expect(first.key).toBe('SEQ-1');
    expect(second.key).toBe('SEQ-2');
    expect(second.title).toBe('Second');
    expect(second.labels).toEqual(['ui', 'api']);
    expect(first.statusId).toBe(view.statuses[0].id);
    expect(first.groupId).toBe(view.groups[0].id);

    const byKey = await as(viewer).get(`/api/workspaces/${workspaceId}/tickets/by-key/seq 2`);
    expect(byKey.status).toBe(200);
    expect(byKey.body.data.ticket.id).toBe(second.id);
    expect(byKey.body.data.status.name).toBe('To do');
    expect(byKey.body.data.activity.map((entry: { type: string }) => entry.type)).toEqual(['created']);

    const search = await as(owner).get(`/api/workspaces/${workspaceId}/tickets?q=SEQ-1`);
    expect(search.body.data.tickets.map((ticket: Ticket) => ticket.id)).toEqual([first.id]);
  });

  it('enforces roles: viewers read, outsiders are refused', async () => {
    if (!dbReady) return;
    const view = await createBoard({ name: 'Roles', key: 'ROLE' });
    const ticket = await createTicket(view.board.id, { title: 'Guarded' });

    expect((await as(viewer).get(`/api/ticket-boards/${view.board.id}`)).status).toBe(200);
    expect((await as(viewer).post(`/api/ticket-boards/${view.board.id}/tickets`, { title: 'x' })).status).toBe(403);
    expect((await as(viewer).patch(`/api/tickets/${ticket.id}`, { title: 'x' })).status).toBe(403);
    expect((await as(viewer).post(`/api/workspaces/${workspaceId}/ticket-boards`, { name: 'x' })).status).toBe(403);
    expect((await as(viewer).post(`/api/tickets/${ticket.id}/comments`, { body: 'hi' })).status).toBe(403);

    expect((await as(outsider).get(`/api/ticket-boards/${view.board.id}`)).status).toBe(403);
    expect((await as(outsider).get(`/api/tickets/${ticket.id}`)).status).toBe(403);
    expect((await as(outsider).get(`/api/workspaces/${workspaceId}/tickets`)).status).toBe(403);

    expect((await as(editor).patch(`/api/tickets/${ticket.id}`, { title: 'Edited' })).status).toBe(200);
  });

  it('records activity and validates assignees', async () => {
    if (!dbReady) return;
    const view = await createBoard({ name: 'Activity', key: 'ACT' });
    const ticket = await createTicket(view.board.id, { title: 'Track me' });
    const done = view.statuses.find((status) => status.name === 'Done')!;

    const notMember = await as(owner).patch(`/api/tickets/${ticket.id}`, { assigneeIds: [outsider.userId] });
    expect(notMember.status).toBe(400);
    expect(notMember.body.error).toBe('INVALID_ASSIGNEE');

    const patched = await as(owner).patch(`/api/tickets/${ticket.id}`, {
      statusId: done.id,
      priority: 'urgent',
      dueDate: '2026-12-01',
      assigneeIds: [editor.userId, owner.userId],
      description: 'Some details',
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data.ticket.statusId).toBe(done.id);
    expect(patched.body.data.ticket.dueDate).toBe('2026-12-01');
    expect(patched.body.data.ticket.assigneeIds.sort()).toEqual([editor.userId, owner.userId].sort());

    const activity = await as(owner).get(`/api/tickets/${ticket.id}/activity`);
    const types = activity.body.data.activity.map((entry: { type: string }) => entry.type);
    expect(types).toEqual(expect.arrayContaining(['created', 'status', 'priority', 'due', 'assignees']));
    const status = activity.body.data.activity.find((entry: { type: string }) => entry.type === 'status');
    expect(status.data).toEqual({ from: 'To do', to: 'Done' });

    const mine = await as(editor).get(`/api/workspaces/${workspaceId}/tickets?assignee=me`);
    expect(mine.body.data.tickets.map((entry: Ticket) => entry.id)).toContain(ticket.id);
    const open = await as(editor).get(`/api/workspaces/${workspaceId}/tickets?assignee=me&state=open`);
    expect(open.body.data.tickets.map((entry: Ticket) => entry.id)).not.toContain(ticket.id);

    const found = await as(owner).get(`/api/workspaces/${workspaceId}/tickets?q=details`);
    expect(found.body.data.tickets.map((entry: Ticket) => entry.id)).toContain(ticket.id);

    const summary = await board(view.board.id);
    expect(summary.board.ticketCount).toBe(1);
    expect(summary.board.openCount).toBe(0);
  });

  it('moves tickets between groups and statuses with dense positions', async () => {
    if (!dbReady) return;
    const view = await createBoard({ name: 'Moves', key: 'MOVE' });
    const groupB = (await as(owner).post(`/api/ticket-boards/${view.board.id}/groups`, { name: 'Sprint 1' })).body.data
      .group as Group;
    const [a, b, c] = [
      await createTicket(view.board.id, { title: 'a' }),
      await createTicket(view.board.id, { title: 'b' }),
      await createTicket(view.board.id, { title: 'c' }),
    ];

    const moved = await as(owner).put(`/api/tickets/${a.id}/move`, { groupId: groupB.id, position: 0 });
    expect(moved.status).toBe(200);
    const byId = (data: BoardView) => new Map(data.tickets.map((ticket) => [ticket.id, ticket]));
    let tickets = byId(moved.body.data);
    expect(tickets.get(a.id)!.groupId).toBe(groupB.id);
    expect(tickets.get(b.id)!.position).toBe(0);
    expect(tickets.get(c.id)!.position).toBe(1);

    const reordered = await as(owner).put(`/api/tickets/${c.id}/move`, { position: 0 });
    tickets = byId(reordered.body.data);
    expect(tickets.get(c.id)!.position).toBe(0);
    expect(tickets.get(b.id)!.position).toBe(1);

    const doing = view.statuses[1];
    const kanban = await as(owner).put(`/api/tickets/${b.id}/move`, { statusId: doing.id, statusPosition: 0 });
    tickets = byId(kanban.body.data);
    expect(tickets.get(b.id)!.statusId).toBe(doing.id);
    expect(tickets.get(b.id)!.statusPosition).toBe(0);
    expect(tickets.get(a.id)!.statusPosition).toBe(0);
    expect(tickets.get(c.id)!.statusPosition).toBe(1);

    const activity = await as(owner).get(`/api/tickets/${a.id}/activity`);
    expect(activity.body.data.activity.at(-1)).toMatchObject({ type: 'group', data: { from: 'Backlog', to: 'Sprint 1' } });

    const otherBoard = await createBoard({ name: 'Elsewhere', key: 'ELSE' });
    const crossBoard = await as(owner).put(`/api/tickets/${a.id}/move`, { groupId: otherBoard.groups[0].id });
    expect(crossBoard.status).toBe(404);
  });

  it('deletes statuses and groups only with somewhere to move tickets', async () => {
    if (!dbReady) return;
    const view = await createBoard({ name: 'Cleanup', key: 'CLEAN' });
    const [todo, , blocked] = view.statuses;
    const ticket = await createTicket(view.board.id, { title: 'Stuck', statusId: blocked.id });

    const missing = await as(owner).del(`/api/ticket-statuses/${blocked.id}`);
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('MOVE_TARGET_REQUIRED');

    const removed = await as(owner).del(`/api/ticket-statuses/${blocked.id}`, { moveTo: todo.id });
    expect(removed.status).toBe(200);
    expect(removed.body.data.statuses.map((status: Status) => status.name)).toEqual(['To do', 'In progress', 'Done']);
    expect(removed.body.data.tickets.find((entry: Ticket) => entry.id === ticket.id).statusId).toBe(todo.id);

    const order = await as(owner).put(`/api/ticket-boards/${view.board.id}/statuses/order`, {
      ids: [...removed.body.data.statuses.map((status: Status) => status.id)].reverse(),
    });
    expect(order.status).toBe(200);
    expect(order.body.data.statuses[0].name).toBe('Done');

    const lastGroup = await as(owner).del(`/api/ticket-groups/${view.groups[0].id}`);
    expect(lastGroup.status).toBe(400);
    expect(lastGroup.body.error).toBe('LAST_GROUP');

    const extra = (await as(owner).post(`/api/ticket-boards/${view.board.id}/groups`, { name: 'Later' })).body.data
      .group as Group;
    const groupGone = await as(owner).del(`/api/ticket-groups/${view.groups[0].id}`, { moveTo: extra.id });
    expect(groupGone.status).toBe(200);
    expect(groupGone.body.data.tickets[0].groupId).toBe(extra.id);
  });

  it('lets only authors edit comments and authors or owners delete them', async () => {
    if (!dbReady) return;
    const view = await createBoard({ name: 'Talk', key: 'TALK' });
    const ticket = await createTicket(view.board.id, { title: 'Discuss' });

    const posted = await as(editor).post(`/api/tickets/${ticket.id}/comments`, { body: ' Looks good ' });
    expect(posted.status).toBe(201);
    const comment = posted.body.data.comment;
    expect(comment.body).toBe('Looks good');
    expect(comment.editable).toBe(true);

    expect((await as(owner).patch(`/api/ticket-comments/${comment.id}`, { body: 'hijack' })).status).toBe(403);
    expect((await as(editor).patch(`/api/ticket-comments/${comment.id}`, { body: 'Edited' })).status).toBe(200);

    const ownerView = await as(owner).get(`/api/tickets/${ticket.id}/comments`);
    expect(ownerView.body.data.comments[0]).toMatchObject({ body: 'Edited', editable: false, deletable: true });

    expect((await as(owner).del(`/api/ticket-comments/${comment.id}`)).status).toBe(200);
    const after = await as(viewer).get(`/api/tickets/${ticket.id}/comments`);
    expect(after.body.data.comments).toEqual([]);
  });

  it('soft-deletes tickets and boards', async () => {
    if (!dbReady) return;
    const view = await createBoard({ name: 'Bin', key: 'BIN' });
    const ticket = await createTicket(view.board.id, { title: 'Gone soon' });
    expect((await as(owner).del(`/api/tickets/${ticket.id}`)).status).toBe(200);
    expect((await as(owner).get(`/api/tickets/${ticket.id}`)).status).toBe(404);
    expect((await board(view.board.id)).tickets).toEqual([]);

    const next = await createTicket(view.board.id, { title: 'Numbering continues' });
    expect(next.key).toBe('BIN-2');

    expect((await as(owner).del(`/api/ticket-boards/${view.board.id}`)).status).toBe(200);
    expect((await as(owner).get(`/api/ticket-boards/${view.board.id}`)).status).toBe(404);
    const reuse = await as(owner).post(`/api/workspaces/${workspaceId}/ticket-boards`, { name: 'Bin again', key: 'BIN' });
    expect(reuse.status).toBe(201);
  });

  it('refuses tickets in encrypted workspaces', async () => {
    if (!dbReady) return;
    const created = await as(outsider).post('/api/workspaces', { name: `Sealed tickets ${stamp}` });
    expect(created.status).toBe(201);
    const sealedId = created.body.data.workspace.id as string;
    await db.update(workspaces).set({ encrypted: true }).where(eq(workspaces.id, sealedId));

    const res = await as(outsider).post(`/api/workspaces/${sealedId}/ticket-boards`, { name: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('TICKETS_ENCRYPTION_PENDING');
  });
});
