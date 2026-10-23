import { beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool, db } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { oauthMobileCodes } from '../db/schemas';
import { env } from '../config/env';
import type { OAuthExchanger } from '../oauth/providers';

const stamp = Date.now();
const oauthEmail = `oauth-new-${stamp}@example.com`;
const existingEmail = `oauth-existing-${stamp}@example.com`;
const inviteeEmail = `oauth-invitee-${stamp}@example.com`;
const existingInviteeEmail = `oauth-invitee-existing-${stamp}@example.com`;
const password = 'password12';

function refreshCookiePair(setCookie: string | string[] | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const raw = list.find((line) => line.startsWith('dirah_refresh='));
  expect(raw).toBeTruthy();
  expect(raw).toMatch(/HttpOnly/i);
  expect(raw).toMatch(/Path=\/api\/auth/);
  return (raw ?? '').split(';')[0] ?? '';
}

const exchanger: OAuthExchanger = async ({ code }) => {
  if (code === 'unverified') {
    const err = new Error('unverified') as Error & { code?: string };
    err.code = 'OAUTH_EMAIL_UNVERIFIED';
    throw err;
  }
  if (code === 'existing') {
    return { email: existingEmail, providerUserId: `google-existing-${stamp}` };
  }
  if (code === 'invitee') {
    return { email: inviteeEmail, providerUserId: `google-invitee-${stamp}` };
  }
  if (code === 'invitee-existing') {
    return { email: existingInviteeEmail, providerUserId: `google-invitee-existing-${stamp}` };
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
      // Set ALLOW_DB_SKIP=1 to run without Postgres; otherwise a missing database must fail, not pass.
      if (process.env.ALLOW_DB_SKIP !== '1') throw error;
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
    expect(firstUrl.hash).toBe('');
    expect(firstUrl.search).not.toContain('refreshToken');
    const refreshCookie = refreshCookiePair(first.headers['set-cookie']);

    const session = await request(appOn).post('/api/auth/refresh').set('Cookie', refreshCookie);
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
    expect(new URL(second.headers.location ?? '').hash).toBe('');
    const session2 = await request(appOn)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookiePair(second.headers['set-cookie']));
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
    expect(new URL(linked.headers.location ?? '').hash).toBe('');
    const session3 = await request(appOn)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookiePair(linked.headers['set-cookie']));
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

  it('joins an invited workspace in the same sign-in when the email matches', async () => {
    if (!dbReady) return;

    const owner = await request(appOn)
      .post('/api/auth/register')
      .send({ email: `oauth-owner-${stamp}@example.com`, password });
    expect(owner.status).toBe(201);
    const ownerToken = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;

    async function invite(email: string): Promise<string> {
      const res = await request(appOn)
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email, role: 'editor' });
      expect(res.status).toBe(201);
      return String(res.body.data.invite.inviteUrl).split('/invite/')[1] ?? '';
    }

    async function signIn(code: string, inviteToken: string) {
      const start = await request(appOn).get('/api/auth/oauth/google/start').query({ invite: inviteToken });
      expect(start.status).toBe(302);
      const state = new URL(start.headers.location ?? '').searchParams.get('state') ?? '';
      const callback = await request(appOn).get('/api/auth/oauth/google/callback').query({ code, state });
      expect(callback.status).toBe(302);
      const session = await request(appOn)
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookiePair(callback.headers['set-cookie']));
      const access = session.body.data.tokens.accessToken as string;
      const list = await request(appOn).get('/api/workspaces').set('Authorization', `Bearer ${access}`);
      return {
        location: new URL(callback.headers.location ?? ''),
        workspaces: list.body.data.workspaces as { id: string; name: string; role: string }[],
      };
    }

    const newToken = await invite(inviteeEmail);
    const fresh = await signIn('invitee', newToken);
    expect(fresh.location.pathname).toBe('/oauth');
    expect(fresh.location.searchParams.get('workspace')).toBe(workspaceId);
    expect(fresh.workspaces.map((w) => [w.id, w.role])).toEqual([[workspaceId, 'editor']]);
    expect((await request(appOn).get(`/api/invites/${newToken}`)).status).toBe(404);

    const registered = await request(appOn)
      .post('/api/auth/register')
      .send({ email: existingInviteeEmail, password });
    expect(registered.status).toBe(201);
    const existingToken = await invite(existingInviteeEmail);
    const existing = await signIn('invitee-existing', existingToken);
    expect(existing.location.searchParams.get('workspace')).toBe(workspaceId);
    expect(existing.workspaces.find((w) => w.id === workspaceId)?.role).toBe('editor');

    const otherToken = await invite(`oauth-invite-other-${stamp}@example.com`);
    const mismatch = await signIn('new', otherToken);
    expect(mismatch.location.searchParams.get('workspace')).toBeNull();
    expect(mismatch.workspaces.some((w) => w.id === workspaceId)).toBe(false);
    expect((await request(appOn).get(`/api/invites/${otherToken}`)).status).toBe(200);

    const bad = await request(appOn).get('/api/auth/oauth/google/start').query({ invite: '../nope' });
    expect(bad.status).toBe(400);
  });

  it('exchanges a one-time mobile code and rejects unknown returns, replays, and expiry', async () => {
    if (!dbReady) return;

    const unknown = await request(appOn).get('/api/auth/oauth/google/start').query({ return: 'https://evil.example/oauth' });
    expect(unknown.status).toBe(400);

    const start = await request(appOn).get('/api/auth/oauth/google/start').query({ return: 'diramobile://oauth' });
    expect(start.status).toBe(302);
    const state = new URL(start.headers.location ?? '').searchParams.get('state') ?? '';
    const callback = await request(appOn).get('/api/auth/oauth/google/callback').query({ code: 'new', state });
    expect(callback.status).toBe(302);
    const redirected = new URL(callback.headers.location ?? '');
    expect(redirected.protocol).toBe('diramobile:');
    expect(redirected.hostname).toBe('oauth');
    expect(redirected.search).not.toContain('refreshToken');
    const cookie = callback.headers['set-cookie'];
    const cookieText = Array.isArray(cookie) ? cookie.join('\n') : (cookie ?? '');
    expect(cookieText).not.toContain('dirah_refresh=');
    const code = redirected.searchParams.get('code') ?? '';
    expect(code.length).toBeGreaterThan(20);

    const exchanged = await request(appOn).post('/api/auth/oauth/mobile-exchange').send({ code });
    expect(exchanged.status).toBe(200);
    expect(exchanged.body.data.user.email).toBe(oauthEmail);
    expect(typeof exchanged.body.data.tokens.accessToken).toBe('string');
    expect(typeof exchanged.body.data.tokens.refreshToken).toBe('string');

    const replay = await request(appOn).post('/api/auth/oauth/mobile-exchange').send({ code });
    expect(replay.status).toBe(400);

    const startBrowser = await request(appOn).get('/api/auth/oauth/google/start').query({ return: 'diramobile://oauth' });
    const stateBrowser = new URL(startBrowser.headers.location ?? '').searchParams.get('state') ?? '';
    const callbackBrowser = await request(appOn).get('/api/auth/oauth/google/callback').query({
      code: 'new',
      state: stateBrowser,
    });
    const browserCode = new URL(callbackBrowser.headers.location ?? '').searchParams.get('code') ?? '';
    const origin = env.corsOrigin === '*' ? 'http://localhost:5181' : env.corsOrigin;
    const asBrowser = await request(appOn)
      .post('/api/auth/oauth/mobile-exchange')
      .set('Origin', origin)
      .send({ code: browserCode });
    expect(asBrowser.status).toBe(200);
    expect(asBrowser.body.data.tokens.refreshToken).toBeUndefined();
    expect(JSON.stringify(asBrowser.headers['set-cookie'] ?? '')).toContain('dirah_refresh=');

    const startExpired = await request(appOn).get('/api/auth/oauth/google/start').query({ return: 'diramobile://oauth' });
    const stateExpired = new URL(startExpired.headers.location ?? '').searchParams.get('state') ?? '';
    const callbackExpired = await request(appOn).get('/api/auth/oauth/google/callback').query({
      code: 'new',
      state: stateExpired,
    });
    const expiredCode = new URL(callbackExpired.headers.location ?? '').searchParams.get('code') ?? '';
    const expiredHash = crypto.createHash('sha256').update(expiredCode).digest('hex');
    await db.update(oauthMobileCodes).set({ expiresAt: new Date(0) }).where(eq(oauthMobileCodes.codeHash, expiredHash));
    const expired = await request(appOn).post('/api/auth/oauth/mobile-exchange').send({ code: expiredCode });
    expect(expired.status).toBe(400);
  });
});
