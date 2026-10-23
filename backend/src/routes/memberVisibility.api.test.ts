import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { db, pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';

const stamp = Date.now();
const password = 'password12';

type Session = { token: string; workspaceId: string; userId: string; email: string };
type MemberWorkspace = { workspaceId: string; name: string; role: string; hidden: boolean };

describe('member workspace visibility', () => {
  let app: Express;
  let dbReady = false;
  let owner: Session;
  let guest: Session;
  let colleague: Session;
  let main: string;
  let second: string;
  let third: string;

  async function register(label: string): Promise<Session> {
    const email = `visibility-${label}-${stamp}@example.com`;
    const res = await request(app).post('/api/auth/register').send({ email, password });
    expect(res.status).toBe(201);
    return {
      token: res.body.data.tokens.accessToken as string,
      workspaceId: res.body.data.workspace.id as string,
      userId: res.body.data.user.id as string,
      email,
    };
  }

  function as(session: Session) {
    const auth = { Authorization: `Bearer ${session.token}` };
    return {
      get: (url: string) => request(app).get(url).set(auth),
      post: (url: string, body: object = {}) => request(app).post(url).set(auth).send(body),
      patch: (url: string, body: object) => request(app).patch(url).set(auth).send(body),
      put: (url: string, body: object) => request(app).put(url).set(auth).send(body),
    };
  }

  async function createWorkspace(name: string): Promise<string> {
    const res = await as(owner).post('/api/workspaces', { name: `${name} ${stamp}` });
    expect(res.status).toBe(201);
    return res.body.data.workspace.id as string;
  }

  async function join(workspaceId: string, session: Session, role: 'admin' | 'editor' | 'viewer') {
    const res = await as(owner).post(`/api/workspaces/${workspaceId}/members`, { email: session.email, role });
    expect(res.status).toBe(201);
    const token = String(res.body.data.invite.inviteUrl).split('/invite/')[1];
    expect((await as(session).post(`/api/invites/${token}/accept`)).status).toBe(201);
  }

  async function visibleTo(session: Session): Promise<string[]> {
    const res = await as(session).get('/api/workspaces');
    expect(res.status).toBe(200);
    return (res.body.data.workspaces as { id: string }[]).map((workspace) => workspace.id);
  }

  async function setHidden(actor: Session, workspaceId: string, target: Session, hidden: boolean) {
    return as(actor).patch(`/api/workspaces/${workspaceId}/members/${target.userId}`, { hidden });
  }

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping member visibility API tests: database unavailable', error);
      if (process.env.ALLOW_DB_SKIP !== '1') throw error;
      return;
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();

    owner = await register('owner');
    guest = await register('guest');
    colleague = await register('colleague');
    main = owner.workspaceId;
    second = await createWorkspace('Client B');
    third = await createWorkspace('Client C');
    await join(main, guest, 'editor');
    await join(second, guest, 'viewer');
    await join(main, colleague, 'editor');
  }, 60_000);

  it('starts every membership visible', async () => {
    if (!dbReady) return;
    const members = await as(owner).get(`/api/workspaces/${main}/members`);
    expect(members.status).toBe(200);
    for (const member of members.body.data.members as { hidden: boolean }[]) {
      expect(member.hidden).toBe(false);
    }
    expect(await visibleTo(guest)).toEqual(expect.arrayContaining([main, second, guest.workspaceId]));
  });

  it('hides a workspace from one member as an access scope, keeping their role', async () => {
    if (!dbReady) return;
    const upload = await request(app)
      .post(`/api/workspaces/${main}/blobs`)
      .set('Authorization', `Bearer ${owner.token}`)
      .set('Content-Type', 'text/plain')
      .send(Buffer.from(`secret ${stamp}`));
    expect(upload.status).toBe(201);
    const blobUrl = upload.body.data.blob.url as string;

    const tokenRes = await as(guest).post('/api/mcp/tokens', { name: 'guest-agent' });
    const tokenId = tokenRes.body.data.token.id as string;
    const secret = tokenRes.body.data.token.secret as string;
    await as(guest).put(`/api/mcp/tokens/${tokenId}/access`, { workspaces: [{ workspaceId: main, canWrite: true }] });

    const hidden = await setHidden(owner, main, guest, true);
    expect(hidden.status).toBe(200);
    expect(hidden.body.data.member).toMatchObject({ userId: guest.userId, role: 'editor', hidden: true });

    expect(await visibleTo(guest)).not.toContain(main);
    expect(await visibleTo(guest)).toContain(second);
    for (const url of [
      `/api/workspaces/${main}`,
      `/api/workspaces/${main}/pages`,
      `/api/workspaces/${main}/notes`,
      `/api/workspaces/${main}/ticket-boards`,
      `/api/workspaces/${main}/members`,
      blobUrl,
    ]) {
      const res = await as(guest).get(url);
      expect(res.status, url).toBe(403);
    }
    // Same answer as a real non-member gets.
    expect((await request(app).get(`/api/workspaces/${main}`).set('Authorization', `Bearer ${guest.token}`)).body.error).toBe(
      'FORBIDDEN'
    );

    const access = await as(guest).get(`/api/mcp/tokens/${tokenId}/access`);
    expect(JSON.stringify(access.body.data)).not.toContain(main);
    const mcp = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', `Bearer ${secret}`)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'list_ticket_boards', arguments: { workspaceId: main } },
      });
    expect(mcp.text).toContain('"isError":true');
    expect(mcp.text).toContain('FORBIDDEN');

    // The member cannot unhide themselves.
    expect((await setHidden(guest, main, guest, false)).status).toBe(403);

    const shown = await setHidden(owner, main, guest, false);
    expect(shown.body.data.member).toMatchObject({ role: 'editor', hidden: false });
    expect(await visibleTo(guest)).toContain(main);
    expect((await as(guest).get(`/api/workspaces/${main}/pages`)).status).toBe(200);
  });

  it('only lets owners and admins hide, never themselves or an owner', async () => {
    if (!dbReady) return;
    expect((await setHidden(colleague, main, guest, true)).status).toBe(403);

    const self = await setHidden(owner, main, owner, true);
    expect(self.status).toBe(409);
    expect(self.body.error).toBe('CANNOT_HIDE_SELF');

    expect((await as(owner).patch(`/api/workspaces/${main}/members/${colleague.userId}`, { role: 'owner' })).status).toBe(200);
    const ownerHide = await setHidden(owner, main, colleague, true);
    expect(ownerHide.status).toBe(409);
    expect(ownerHide.body.error).toBe('CANNOT_HIDE_OWNER');
    expect((await as(owner).patch(`/api/workspaces/${main}/members/${colleague.userId}`, { role: 'editor' })).status).toBe(200);

    expect((await as(owner).patch(`/api/workspaces/${main}/members/${guest.userId}`, {})).status).toBe(400);
  });

  it('manages one member across every workspace the actor administers', async () => {
    if (!dbReady) return;
    const listed = await as(owner).get(`/api/members/${guest.userId}/workspaces`);
    expect(listed.status).toBe(200);
    const rows = listed.body.data.workspaces as MemberWorkspace[];
    expect(rows.map((row) => row.workspaceId).sort()).toEqual([main, second].sort());
    expect(rows.find((row) => row.workspaceId === second)).toMatchObject({ role: 'viewer', hidden: false });
    expect(rows.map((row) => row.workspaceId)).not.toContain(third);
    expect(rows.map((row) => row.workspaceId)).not.toContain(guest.workspaceId);

    // The guest is not an admin anywhere the colleague is, so nothing is listed for them.
    expect((await as(colleague).get(`/api/members/${guest.userId}/workspaces`)).body.data.workspaces).toEqual([]);

    const both = await as(owner).put(`/api/members/${guest.userId}/workspaces`, {
      workspaces: [
        { workspaceId: main, hidden: true },
        { workspaceId: second, hidden: true },
      ],
    });
    expect(both.status).toBe(200);
    expect((both.body.data.workspaces as MemberWorkspace[]).every((row) => row.hidden)).toBe(true);
    expect(await visibleTo(guest)).toEqual([guest.workspaceId]);

    // A workspace the owner doesn't administer rejects the whole batch.
    const outside = await as(owner).put(`/api/members/${guest.userId}/workspaces`, {
      workspaces: [
        { workspaceId: main, hidden: false },
        { workspaceId: guest.workspaceId, hidden: true },
      ],
    });
    expect(outside.status).toBe(403);
    expect(await visibleTo(guest)).toEqual([guest.workspaceId]);

    const restore = await as(owner).put(`/api/members/${guest.userId}/workspaces`, {
      workspaces: [
        { workspaceId: main, hidden: false },
        { workspaceId: second, hidden: false },
      ],
    });
    expect(restore.status).toBe(200);
    expect(await visibleTo(guest)).toEqual(expect.arrayContaining([main, second]));
  });

  it('keeps hidden members off new ticket assignments but keeps existing ones', async () => {
    if (!dbReady) return;
    const boardRes = await as(owner).post(`/api/workspaces/${main}/ticket-boards`, { name: 'Visibility' });
    expect(boardRes.status).toBe(201);
    const boardId = boardRes.body.data.board.id as string;
    const assigned = await as(owner).post(`/api/ticket-boards/${boardId}/tickets`, {
      title: 'Assigned before hiding',
      assigneeIds: [guest.userId],
    });
    expect(assigned.status).toBe(201);
    const ticketId = assigned.body.data.ticket.id as string;

    expect((await setHidden(owner, main, guest, true)).status).toBe(200);

    const fresh = await as(owner).post(`/api/ticket-boards/${boardId}/tickets`, {
      title: 'New',
      assigneeIds: [guest.userId],
    });
    expect(fresh.status).toBe(400);
    expect(fresh.body.error).toBe('INVALID_ASSIGNEE');

    const kept = await as(owner).patch(`/api/tickets/${ticketId}`, { assigneeIds: [guest.userId, colleague.userId] });
    expect(kept.status).toBe(200);
    expect((kept.body.data.ticket.assigneeIds as string[]).sort()).toEqual([guest.userId, colleague.userId].sort());

    expect((await setHidden(owner, main, guest, false)).status).toBe(200);
  });
});
