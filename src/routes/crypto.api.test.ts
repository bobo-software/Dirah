import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { db, pool } from '../db';
import { markdownBodies } from '../db/schemas';

const secret = 'zephyrquill';

async function registerOwner(app: Express) {
  const email = `e2e-${crypto.randomUUID()}@example.com`;
  const registered = await request(app).post('/api/auth/register').send({ email, password: 'password12' });
  expect(registered.status).toBe(201);
  return {
    token: registered.body.data.tokens.accessToken as string,
    workspaceId: registered.body.data.workspace.id as string,
  };
}

describe('workspace page encryption', () => {
  let app: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      dbReady = true;
    } catch (error) {
      console.warn('Skipping workspace encryption API tests: database unavailable', error);
    }
    app = await createApp();
  });

  it('lets the owner enable encryption and stores opaque markdown', async () => {
    if (!dbReady) return;

    const { token, workspaceId } = await registerOwner(app);
    const page = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Sealed', kind: 'markdown' });
    expect(page.status).toBe(201);
    const pageId = page.body.data.page.id as string;

    const current = await request(app).get(`/api/pages/${pageId}/markdown`).set('Authorization', `Bearer ${token}`);
    const planted = await request(app)
      .put(`/api/pages/${pageId}/markdown`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: `notes about ${secret}`, hash: current.body.data.hash });
    expect(planted.status).toBe(200);

    const enabled = await request(app)
      .post(`/api/workspaces/${workspaceId}/crypto/enable`)
      .set('Authorization', `Bearer ${token}`)
      .send({ wrappedDek: 'wrapped-owner' });
    expect(enabled.status).toBe(200);
    expect(enabled.body.data.encrypted).toBe(true);

    const listed = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .query({ q: secret })
      .set('Authorization', `Bearer ${token}`);
    expect(listed.body.data.pages.map((item: { id: string }) => item.id)).not.toContain(pageId);

    const again = await request(app)
      .post(`/api/workspaces/${workspaceId}/crypto/enable`)
      .set('Authorization', `Bearer ${token}`)
      .send({ wrappedDek: 'wrapped-owner' });
    expect(again.status).toBe(409);

    const envelope = `DR1.${Buffer.from('opaque-body').toString('base64')}`;
    const after = await request(app).get(`/api/pages/${pageId}/markdown`).set('Authorization', `Bearer ${token}`);
    const saved = await request(app)
      .put(`/api/pages/${pageId}/markdown`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: envelope, hash: after.body.data.hash });
    expect(saved.status).toBe(200);
    expect(saved.body.data.content).not.toContain(secret);

    const [row] = await db.select().from(markdownBodies).where(eq(markdownBodies.pageId, pageId));
    expect(row?.content).toBe(envelope);
    expect(row?.content).not.toContain(secret);

    const shared = await request(app)
      .post(`/api/pages/${pageId}/share`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(shared.status).toBe(409);
    expect(shared.body.error).toBe('WORKSPACE_ENCRYPTED');

    const asked = await request(app)
      .post(`/api/ai/pages/${pageId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ prompt: 'What does this page say?', context: secret });
    expect(asked.status).toBe(409);
    expect(asked.body.error).toBe('WORKSPACE_ENCRYPTED');
  });

  it('refuses a viewer', async () => {
    if (!dbReady) return;

    const owner = await registerOwner(app);
    const viewerEmail = `viewer-${crypto.randomUUID()}@example.com`;
    const invited = await request(app)
      .post(`/api/workspaces/${owner.workspaceId}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: viewerEmail, role: 'viewer' });
    expect(invited.status).toBe(201);
    const inviteUrl = invited.body.data.invite.inviteUrl as string;
    const inviteToken = inviteUrl.split('/invite/')[1];
    const accepted = await request(app).post(`/api/invites/${inviteToken}/accept`).send({ password: 'password12' });
    expect(accepted.status).toBe(201);
    const viewerToken = accepted.body.data.tokens.accessToken as string;
    const denied = await request(app)
      .post(`/api/workspaces/${owner.workspaceId}/crypto/enable`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ wrappedDek: 'nope' });
    expect(denied.status).toBe(403);
  });
});
