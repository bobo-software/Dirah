import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool, db } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { workspaceInvites } from '../db/schemas';
import { eq } from 'drizzle-orm';

const stamp = Date.now();
const ownerEmail = `invite-owner-${stamp}@example.com`;
const editorEmail = `invite-editor-${stamp}@example.com`;
const guestEmail = `invite-guest-${stamp}@example.com`;
const password = 'password12';

describe('email invites API', () => {
  let app: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping invite API tests: database unavailable', error);
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
  });

  afterAll(async () => {});

  it('creates a pending invite, accepts it, and refuses expired tokens', async () => {
    if (!dbReady) {
      return;
    }

    const owner = await request(app).post('/api/auth/register').send({ email: ownerEmail, password });
    expect(owner.status).toBe(201);
    const ownerToken = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;
    const workspaceName = owner.body.data.workspace.name as string;

    const existing = await request(app)
      .post('/api/auth/register')
      .send({ email: editorEmail, password });
    expect(existing.status).toBe(201);
    const editorToken = existing.body.data.tokens.accessToken as string;

    const added = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: editorEmail, role: 'editor' });
    expect(added.status).toBe(201);
    expect(added.body.data.member.email).toBe(editorEmail);

    const viewerInvite = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ email: guestEmail, role: 'viewer' });
    expect(viewerInvite.status).toBe(403);

    const pending = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: guestEmail, role: 'editor' });
    expect(pending.status).toBe(201);
    expect(pending.body.data.invite.email).toBe(guestEmail);
    expect(pending.body.data.invite.role).toBe('editor');
    expect(pending.body.data.invite.mailed).toBe(false);
    expect(pending.body.data.invite.inviteUrl).toMatch(/\/invite\//);

    const listed = await request(app)
      .get(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.invites).toHaveLength(1);
    expect(listed.body.data.invites[0].email).toBe(guestEmail);

    const token = String(pending.body.data.invite.inviteUrl).split('/invite/')[1];
    const preview = await request(app).get(`/api/invites/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.invite.email).toBe(guestEmail);
    expect(preview.body.data.invite.workspaceName).toBe(workspaceName);
    expect(preview.body.data.invite.role).toBe('editor');

    const strangerBefore = await request(app)
      .get(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(strangerBefore.status).toBe(200);

    const guestBefore = await request(app).post('/api/auth/login').send({
      email: guestEmail,
      password,
    });
    expect(guestBefore.status).toBe(401);

    const accepted = await request(app)
      .post(`/api/invites/${token}/accept`)
      .send({ password });
    expect(accepted.status).toBe(201);
    expect(accepted.body.data.user.email).toBe(guestEmail);
    expect(accepted.body.data.workspace.id).toBe(workspaceId);
    expect(accepted.body.data.workspace.role).toBe('editor');
    const guestToken = accepted.body.data.tokens.accessToken as string;

    const guestSees = await request(app)
      .get(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${guestToken}`);
    expect(guestSees.status).toBe(200);
    expect(guestSees.body.data.workspace.role).toBe('editor');

    const listedAfter = await request(app)
      .get(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listedAfter.body.data.invites).toHaveLength(0);
    expect(listedAfter.body.data.members.some((m: { email: string }) => m.email === guestEmail)).toBe(
      true
    );

    const reuse = await request(app).post(`/api/invites/${token}/accept`).send({ password });
    expect(reuse.status).toBe(404);

    const missing = await request(app).get('/api/invites/not-a-real-token');
    expect(missing.status).toBe(404);

    const again = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: `invite-late-${stamp}@example.com`, role: 'viewer' });
    expect(again.status).toBe(201);
    const lateToken = String(again.body.data.invite.inviteUrl).split('/invite/')[1];
    await db
      .update(workspaceInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(workspaceInvites.token, lateToken));
    const expired = await request(app).get(`/api/invites/${lateToken}`);
    expect(expired.status).toBe(404);
    const expiredAccept = await request(app)
      .post(`/api/invites/${lateToken}/accept`)
      .send({ password });
    expect(expiredAccept.status).toBe(404);

    const revokeCreate = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: `invite-revoke-${stamp}@example.com`, role: 'viewer' });
    const inviteId = revokeCreate.body.data.invite.id as string;
    const revoked = await request(app)
      .delete(`/api/workspaces/${workspaceId}/invites/${inviteId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(revoked.status).toBe(200);
    const gone = await request(app).get(
      `/api/invites/${String(revokeCreate.body.data.invite.inviteUrl).split('/invite/')[1]}`
    );
    expect(gone.status).toBe(404);
  });
});
