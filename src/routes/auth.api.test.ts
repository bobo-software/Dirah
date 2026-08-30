import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { db } from '../db';

const email = `phase0-${Date.now()}@example.com`;
const password = 'password12';

describe('auth and workspaces API', () => {
  let app: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping auth API tests: database unavailable', error);
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
  });

  it('GET /health still works', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/workspaces without a token is 401', async () => {
    const res = await request(app).get('/api/workspaces');
    expect(res.status).toBe(401);
  });

  it('register, login, workspaces, refresh, and revoke', async () => {
    if (!dbReady) {
      return;
    }

    const registered = await request(app)
      .post('/api/auth/register')
      .send({ email, password });

    expect(registered.status).toBe(201);
    expect(registered.body.success).toBe(true);
    expect(registered.body.data.tokens.accessToken).toBeTruthy();
    expect(registered.body.data.tokens.refreshToken).toBeTruthy();
    expect(registered.body.data.workspace.name).toBe('My workspace');

    const duplicate = await request(app)
      .post('/api/auth/register')
      .send({ email, password });
    expect(duplicate.status).toBe(409);

    const badLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' });
    expect(badLogin.status).toBe(401);

    const access = registered.body.data.tokens.accessToken as string;
    const refresh = registered.body.data.tokens.refreshToken as string;

    const list = await request(app)
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${access}`);
    expect(list.status).toBe(200);
    expect(list.body.data.workspaces.length).toBeGreaterThanOrEqual(1);
    expect(list.body.data.workspaces[0].role).toBe('owner');

    const workspaceId = list.body.data.workspaces[0].id as string;
    const one = await request(app)
      .get(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${access}`);
    expect(one.status).toBe(200);
    expect(one.body.data.workspace.id).toBe(workspaceId);

    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: refresh });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.tokens.accessToken).toBeTruthy();

    const reused = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: refresh });
    expect(reused.status).toBe(401);

    await request(app).post('/api/auth/logout').send({
      refreshToken: refreshed.body.data.tokens.refreshToken,
    });

    const afterLogout = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: refreshed.body.data.tokens.refreshToken });
    expect(afterLogout.status).toBe(401);
  });
});
