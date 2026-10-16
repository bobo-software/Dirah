import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { db } from '../db';

const stamp = Date.now();
const ownerEmail = `phase1-owner-${stamp}@example.com`;
const otherEmail = `phase1-other-${stamp}@example.com`;
const password = 'password12';

describe('pages API', () => {
  let app: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping pages API tests: database unavailable', error);
      // Set ALLOW_DB_SKIP=1 to run without Postgres; otherwise a missing database must fail, not pass.
      if (process.env.ALLOW_DB_SKIP !== '1') throw error;
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
  });

  it('GET /api/workspaces/:id/pages without a token is 401', async () => {
    const res = await request(app).get(
      '/api/workspaces/00000000-0000-4000-8000-000000000001/pages'
    );
    expect(res.status).toBe(401);
  });

  it('owner can CRUD pages; other user is 403', async () => {
    if (!dbReady) {
      return;
    }

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: ownerEmail, password });
    expect(owner.status).toBe(201);
    const ownerToken = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;

    const other = await request(app)
      .post('/api/auth/register')
      .send({ email: otherEmail, password });
    expect(other.status).toBe(201);
    const otherToken = other.body.data.tokens.accessToken as string;

    const forbiddenWorkspace = await request(app)
      .get(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(forbiddenWorkspace.status).toBe(403);

    const unauthCreate = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .send({ title: 'Nope' });
    expect(unauthCreate.status).toBe(401);

    const forbiddenCreate = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Stolen' });
    expect(forbiddenCreate.status).toBe(403);

    const clientId = crypto.randomUUID();
    const created = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ id: clientId, title: 'First page' });
    expect(created.status).toBe(201);
    expect(created.body.data.page.id).toBe(clientId);
    expect(created.body.data.page.title).toBe('First page');
    expect(created.body.data.page.kind).toBe('markdown');
    expect(created.body.data.page).not.toHaveProperty('yjs');
    expect(created.body.data.page).not.toHaveProperty('update');

    const upsert = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ id: clientId, title: 'First page renamed' });
    expect(upsert.status).toBe(201);
    expect(upsert.body.data.page.title).toBe('First page renamed');

    const second = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Second' });
    expect(second.status).toBe(201);

    const list = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.pages).toHaveLength(2);

    const patched = await request(app)
      .patch(`/api/pages/${clientId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Patched', position: 5 });
    expect(patched.status).toBe(200);
    expect(patched.body.data.page.title).toBe('Patched');
    expect(patched.body.data.page.position).toBe(5);

    const forbiddenPatch = await request(app)
      .patch(`/api/pages/${clientId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Hijack' });
    expect(forbiddenPatch.status).toBe(403);

    const removed = await request(app)
      .delete(`/api/pages/${clientId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(removed.status).toBe(200);

    const afterDelete = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(afterDelete.body.data.pages).toHaveLength(1);
    expect(afterDelete.body.data.pages[0].title).toBe('Second');
  });
});
