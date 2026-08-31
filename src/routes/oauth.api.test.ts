import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool, db } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import type { OAuthExchanger } from '../oauth/providers';

const stamp = Date.now();
const oauthEmail = `oauth-new-${stamp}@example.com`;
const existingEmail = `oauth-existing-${stamp}@example.com`;
const password = 'password12';

const exchanger: OAuthExchanger = async ({ code }) => {
  if (code === 'unverified') {
    const err = new Error('unverified') as Error & { code?: string };
    err.code = 'OAUTH_EMAIL_UNVERIFIED';
    throw err;
  }
  if (code === 'existing') {
    return { email: existingEmail, providerUserId: `google-existing-${stamp}` };
  }
  return { email: oauthEmail, providerUserId: `google-new-${stamp}` };
};

describe('oauth API', () => {
  let appOff: Express;
  let appOn: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping oauth API tests: database unavailable', error);
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    appOff = await createApp();
    process.env.GOOGLE_CLIENT_ID = 'test-google-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
    appOn = await createApp({ oauthExchanger: exchanger });
  });

  it('hides OAuth when credentials are unset', async () => {
    const status = await request(appOff).get('/api/auth/oauth/status');
    expect(status.status).toBe(200);
    expect(status.body.data.oauth.google).toBe(false);
    expect(status.body.data.oauth.github).toBe(false);

    const start = await request(appOff).get('/api/auth/oauth/google/start');
    expect(start.status).toBe(503);
  });

  it('creates and reuses an account, links an existing email, and rejects bad state', async () => {
    if (!dbReady) {
      return;
    }

    const status = await request(appOn).get('/api/auth/oauth/status');
    expect(status.body.data.oauth.google).toBe(true);

    const start = await request(appOn).get('/api/auth/oauth/google/start');
    expect(start.status).toBe(302);
    const authorize = new URL(start.headers.location ?? '');
    expect(authorize.hostname).toBe('accounts.google.com');
    const state = authorize.searchParams.get('state') ?? '';
    expect(state.length).toBeGreaterThan(8);

    const first = await request(appOn).get('/api/auth/oauth/google/callback').query({
      code: 'new',
      state,
    });
    expect(first.status).toBe(302);
    const firstUrl = new URL(first.headers.location ?? '');
    expect(firstUrl.pathname).toBe('/oauth');
    const refresh = firstUrl.hash.replace(/^#/, '').split('refreshToken=')[1];
    expect(refresh).toBeTruthy();

    const session = await request(appOn)
      .post('/api/auth/refresh')
      .send({ refreshToken: decodeURIComponent(refresh ?? '') });
    expect(session.status).toBe(200);
    const access = session.body.data.tokens.accessToken as string;
    const me = await request(appOn).get('/api/auth/me').set('Authorization', `Bearer ${access}`);
    expect(me.body.data.user.email).toBe(oauthEmail);
    const userId = me.body.data.user.id as string;

    const workspaces = await request(appOn)
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${access}`);
    expect(workspaces.body.data.workspaces[0].name).toBe('My workspace');

    const passwordLogin = await request(appOn)
      .post('/api/auth/login')
      .send({ email: oauthEmail, password });
    expect(passwordLogin.status).toBe(401);
    expect(passwordLogin.body.message).toMatch(/google or github/i);

    const start2 = await request(appOn).get('/api/auth/oauth/google/start');
    const state2 = new URL(start2.headers.location ?? '').searchParams.get('state') ?? '';
    const second = await request(appOn).get('/api/auth/oauth/google/callback').query({
      code: 'new',
      state: state2,
    });
    const refresh2 = new URL(second.headers.location ?? '').hash
      .replace(/^#/, '')
      .split('refreshToken=')[1];
    const session2 = await request(appOn)
      .post('/api/auth/refresh')
      .send({ refreshToken: decodeURIComponent(refresh2 ?? '') });
    const me2 = await request(appOn)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session2.body.data.tokens.accessToken}`);
    expect(me2.body.data.user.id).toBe(userId);

    const registered = await request(appOn)
      .post('/api/auth/register')
      .send({ email: existingEmail, password });
    expect(registered.status).toBe(201);
    const existingId = registered.body.data.user.id as string;

    const start3 = await request(appOn).get('/api/auth/oauth/google/start');
    const state3 = new URL(start3.headers.location ?? '').searchParams.get('state') ?? '';
    const linked = await request(appOn).get('/api/auth/oauth/google/callback').query({
      code: 'existing',
      state: state3,
    });
    const refresh3 = new URL(linked.headers.location ?? '').hash
      .replace(/^#/, '')
      .split('refreshToken=')[1];
    const session3 = await request(appOn)
      .post('/api/auth/refresh')
      .send({ refreshToken: decodeURIComponent(refresh3 ?? '') });
    const me3 = await request(appOn)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session3.body.data.tokens.accessToken}`);
    expect(me3.body.data.user.id).toBe(existingId);

    const bad = await request(appOn)
      .get('/api/auth/oauth/google/callback')
      .set('Accept', 'application/json')
      .query({ code: 'new', state: 'not-a-jwt' });
    expect(bad.status).toBe(400);

    const start4 = await request(appOn).get('/api/auth/oauth/google/start');
    const state4 = new URL(start4.headers.location ?? '').searchParams.get('state') ?? '';
    const unverified = await request(appOn)
      .get('/api/auth/oauth/google/callback')
      .set('Accept', 'application/json')
      .query({ code: 'unverified', state: state4 });
    expect(unverified.status).toBe(400);
    expect(unverified.body.message).toMatch(/not verified/i);
  });
});
