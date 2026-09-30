import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { db } from '../db';
import { env } from '../config/env';

function refreshCookieLine(setCookie: string | string[] | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const raw = list.find((line) => line.startsWith('dirah_refresh='));
  if (!raw) {
    throw new Error(`missing dirah_refresh cookie: ${list.join(' | ')}`);
  }
  return raw;
}

function cookiePair(setCookieLine: string): string {
  return setCookieLine.split(';')[0] ?? '';
}

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
    expect(registered.body.data.tokens).toEqual({ accessToken: expect.any(String) });
    expect(registered.body.data.tokens.refreshToken).toBeUndefined();
    const issued = refreshCookieLine(registered.headers['set-cookie']);
    expect(issued).toMatch(/HttpOnly/i);
    expect(issued).toMatch(/SameSite=Lax/i);
    expect(issued).toMatch(/Path=\/api\/auth/);
    expect(issued).not.toMatch(/;\s*Secure/i);
    expect(registered.text).not.toContain(decodeURIComponent(cookiePair(issued).slice('dirah_refresh='.length)));
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
    const legacyRefresh = decodeURIComponent(cookiePair(issued).slice('dirah_refresh='.length));

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

    const upgraded = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: legacyRefresh });
    expect(upgraded.status).toBe(200);
    expect(upgraded.body.data.tokens).toEqual({ accessToken: expect.any(String) });
    expect(upgraded.text).not.toContain(legacyRefresh);
    const rotated = refreshCookieLine(upgraded.headers['set-cookie']);

    const reused = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: legacyRefresh });
    expect(reused.status).toBe(401);

    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookiePair(rotated));
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.tokens.refreshToken).toBeUndefined();
    const current = refreshCookieLine(refreshed.headers['set-cookie']);

    const loggedOut = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookiePair(current));
    expect(loggedOut.status).toBe(200);
    expect(refreshCookieLine(loggedOut.headers['set-cookie'])).toMatch(/dirah_refresh=;/);

    const afterLogout = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookiePair(current));
    expect(afterLogout.status).toBe(401);
  });

  it('rejects a session post from a different origin', async () => {
    if (env.corsOrigin === '*') {
      return;
    }
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'someone@example.com', password: 'password12' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('owner can rename and delete a workspace', async () => {
    if (!dbReady) {
      return;
    }

    const ownerEmail = `ws-crud-owner-${Date.now()}@example.com`;
    const editorEmail = `ws-crud-editor-${Date.now()}@example.com`;
    const owner = await request(app).post('/api/auth/register').send({ email: ownerEmail, password });
    expect(owner.status).toBe(201);
    const access = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;

    const editor = await request(app).post('/api/auth/register').send({ email: editorEmail, password });
    const editorAccess = editor.body.data.tokens.accessToken as string;
    await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${access}`)
      .send({ email: editorEmail, role: 'editor' });

    const renamed = await request(app)
      .patch(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${access}`)
      .send({ name: 'Renamed workspace' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.workspace.name).toBe('Renamed workspace');

    const editorRename = await request(app)
      .patch(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${editorAccess}`)
      .send({ name: 'Editor rename' });
    expect(editorRename.status).toBe(403);

    const extra = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${access}`)
      .send({ name: 'Extra workspace' });
    expect(extra.status).toBe(201);
    const extraId = extra.body.data.workspace.id as string;

    const editorDelete = await request(app)
      .delete(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${editorAccess}`);
    expect(editorDelete.status).toBe(403);

    const removed = await request(app)
      .delete(`/api/workspaces/${extraId}`)
      .set('Authorization', `Bearer ${access}`);
    expect(removed.status).toBe(200);

    const gone = await request(app)
      .get(`/api/workspaces/${extraId}`)
      .set('Authorization', `Bearer ${access}`);
    expect(gone.status).toBe(404);
  });
});
