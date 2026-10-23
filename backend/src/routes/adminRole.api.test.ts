import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool, db } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';

const stamp = Date.now();
const password = 'password12';

describe('admin role API', () => {
  let app: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping admin role API tests: database unavailable', error);
      // Set ALLOW_DB_SKIP=1 to run without Postgres; otherwise a missing database must fail, not pass.
      if (process.env.ALLOW_DB_SKIP !== '1') throw error;
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
  });

  async function register(label: string): Promise<{ token: string; userId: string; workspaceId: string }> {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `admin-${label}-${stamp}@example.com`, password });
    expect(res.status).toBe(201);
    return {
      token: res.body.data.tokens.accessToken as string,
      userId: res.body.data.user.id as string,
      workspaceId: res.body.data.workspace.id as string,
    };
  }

  async function join(inviterToken: string, workspaceId: string, label: string, role: string, joinerToken: string) {
    const invite = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${inviterToken}`)
      .send({ email: `admin-${label}-${stamp}@example.com`, role });
    expect(invite.status).toBe(201);
    const inviteToken = String(invite.body.data.invite.inviteUrl).split('/invite/')[1];
    const accepted = await request(app)
      .post(`/api/invites/${inviteToken}/accept`)
      .set('Authorization', `Bearer ${joinerToken}`)
      .send({});
    expect(accepted.status).toBe(201);
    expect(accepted.body.data.workspace.role).toBe(role);
  }

  it('admin manages members and tickets but not owner-only settings', async () => {
    expect(dbReady).toBe(true);
    if (!dbReady) {
      return;
    }

    const owner = await register('owner');
    const admin = await register('admin');
    const editor = await register('editor');
    const viewer = await register('viewer');
    const workspaceId = owner.workspaceId;
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });

    await join(owner.token, workspaceId, 'admin', 'admin', admin.token);

    // Admin creates a ticket and assigns the owner.
    const board = await request(app)
      .post(`/api/workspaces/${workspaceId}/ticket-boards`)
      .set(as(admin.token))
      .send({ name: 'Shared work', key: 'SHW' });
    expect(board.status).toBe(201);
    const boardId = board.body.data.board.id as string;
    const ticket = await request(app)
      .post(`/api/ticket-boards/${boardId}/tickets`)
      .set(as(admin.token))
      .send({ title: 'First', assigneeIds: [owner.userId] });
    expect(ticket.status).toBe(201);

    // Admin invites an editor and a viewer.
    await join(admin.token, workspaceId, 'editor', 'editor', editor.token);
    await join(admin.token, workspaceId, 'viewer', 'viewer', viewer.token);

    // Admin changes roles among non-owners, but cannot touch owners.
    const promote = await request(app)
      .patch(`/api/workspaces/${workspaceId}/members/${editor.userId}`)
      .set(as(admin.token))
      .send({ role: 'admin' });
    expect(promote.status).toBe(200);
    expect(promote.body.data.member.role).toBe('admin');
    const demote = await request(app)
      .patch(`/api/workspaces/${workspaceId}/members/${editor.userId}`)
      .set(as(admin.token))
      .send({ role: 'editor' });
    expect(demote.status).toBe(200);

    const makeOwner = await request(app)
      .patch(`/api/workspaces/${workspaceId}/members/${editor.userId}`)
      .set(as(admin.token))
      .send({ role: 'owner' });
    expect(makeOwner.status).toBe(403);
    const demoteOwner = await request(app)
      .patch(`/api/workspaces/${workspaceId}/members/${owner.userId}`)
      .set(as(admin.token))
      .send({ role: 'viewer' });
    expect(demoteOwner.status).toBe(403);
    const removeOwner = await request(app)
      .delete(`/api/workspaces/${workspaceId}/members/${owner.userId}`)
      .set(as(admin.token));
    expect(removeOwner.status).toBe(403);
    const inviteOwner = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set(as(admin.token))
      .send({ email: `admin-nobody-${stamp}@example.com`, role: 'owner' });
    expect(inviteOwner.status).toBe(400);

    // Owner-only settings stay closed to admins.
    const rename = await request(app).patch(`/api/workspaces/${workspaceId}`).set(as(admin.token)).send({ name: 'x' });
    expect(rename.status).toBe(403);
    const mcp = await request(app)
      .patch(`/api/workspaces/${workspaceId}`)
      .set(as(admin.token))
      .send({ mcpEnabled: false });
    expect(mcp.status).toBe(403);
    const encrypt = await request(app)
      .post(`/api/workspaces/${workspaceId}/crypto/enable`)
      .set(as(admin.token))
      .send({ wrappedDek: 'x' });
    expect(encrypt.status).toBe(403);
    const page = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set(as(admin.token))
      .send({ title: 'Doc', kind: 'markdown' });
    expect(page.status).toBe(201);
    const share = await request(app)
      .post(`/api/pages/${page.body.data.page.id}/share`)
      .set(as(admin.token))
      .send({ permission: 'view' });
    expect(share.status).toBe(403);
    const remove = await request(app).delete(`/api/workspaces/${workspaceId}`).set(as(admin.token));
    expect(remove.status).toBe(403);

    // Editors still cannot manage members; viewers still cannot edit tickets.
    const editorInvite = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set(as(editor.token))
      .send({ email: `admin-other-${stamp}@example.com`, role: 'viewer' });
    expect(editorInvite.status).toBe(403);
    const viewerTicket = await request(app)
      .post(`/api/ticket-boards/${boardId}/tickets`)
      .set(as(viewer.token))
      .send({ title: 'Nope' });
    expect(viewerTicket.status).toBe(403);

    // Admin removes a non-owner; the owner can still demote the admin.
    const removeViewer = await request(app)
      .delete(`/api/workspaces/${workspaceId}/members/${viewer.userId}`)
      .set(as(admin.token));
    expect(removeViewer.status).toBe(200);
    const ownerDemotes = await request(app)
      .patch(`/api/workspaces/${workspaceId}/members/${admin.userId}`)
      .set(as(owner.token))
      .send({ role: 'editor' });
    expect(ownerDemotes.status).toBe(200);
  });
});
