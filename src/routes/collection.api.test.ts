import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { db } from '../db';

const stamp = Date.now();
const ownerEmail = `phase5i-owner-${stamp}@example.com`;
const viewerEmail = `phase5i-viewer-${stamp}@example.com`;
const password = 'password12';

describe('page collection status API', () => {
  let app: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping collection API tests: database unavailable', error);
      // Set ALLOW_DB_SKIP=1 to run without Postgres; otherwise a missing database must fail, not pass.
      if (process.env.ALLOW_DB_SKIP !== '1') throw error;
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
  });

  it('stores status on live pages; viewers cannot patch it', async () => {
    if (!dbReady) {
      return;
    }

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: ownerEmail, password });
    expect(owner.status).toBe(201);
    const ownerToken = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;

    const viewer = await request(app)
      .post('/api/auth/register')
      .send({ email: viewerEmail, password });
    expect(viewer.status).toBe(201);
    const viewerToken = viewer.body.data.tokens.accessToken as string;

    const invited = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: viewerEmail, role: 'viewer' });
    expect(invited.status).toBe(201);
    const inviteToken = String(invited.body.data.invite.inviteUrl).split('/invite/')[1];
    expect(
      (await request(app).post(`/api/invites/${inviteToken}/accept`).set('Authorization', `Bearer ${viewerToken}`).send({})).status
    ).toBe(201);

    const created = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Ship it' });
    expect(created.status).toBe(201);
    expect(created.body.data.page.kind).toBe('markdown');
    expect(created.body.data.page.status).toBe('');
    const pageId = created.body.data.page.id as string;

    const patched = await request(app)
      .patch(`/api/pages/${pageId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'doing' });
    expect(patched.status).toBe(200);
    expect(patched.body.data.page.status).toBe('doing');
    expect(patched.body.data.page.title).toBe('Ship it');

    const listed = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.pages).toHaveLength(1);
    expect(listed.body.data.pages[0].status).toBe('doing');

    const viewerPatch = await request(app)
      .patch(`/api/pages/${pageId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ status: 'done' });
    expect(viewerPatch.status).toBe(403);

    const bad = await request(app)
      .patch(`/api/pages/${pageId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'blocked' });
    expect(bad.status).toBe(400);

    await request(app)
      .delete(`/api/pages/${pageId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const live = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(live.body.data.pages).toHaveLength(0);

    const trash = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages?trashed=1`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(trash.body.data.pages).toHaveLength(1);
    expect(trash.body.data.pages[0].status).toBe('doing');
  });
});
