import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { db } from '../db';
import { emailLogs, passwordResetCodes, workspaces } from '../db/schemas';
import { env } from '../config/env';
import { passwordResetCodeForTests } from '../services/PasswordResetService';
import { AuthService, WORKSPACE_PURGE_AFTER_MS } from '../services/AuthService';

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

/** A browser always sends Origin. Supertest does not, unless we set it. */
function asBrowser(req: request.Test): request.Test {
  const origin = env.corsOrigin === '*' ? 'http://localhost:5181' : env.corsOrigin;
  return req.set('Origin', origin);
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
      // Set ALLOW_DB_SKIP=1 to run without Postgres; otherwise a missing database must fail, not pass.
      if (process.env.ALLOW_DB_SKIP !== '1') throw error;
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

    const registered = await asBrowser(request(app).post('/api/auth/register')).send({
      email,
      password,
      name: '  Ada Lovelace ',
    });

    expect(registered.status).toBe(201);
    expect(registered.body.success).toBe(true);
    expect(registered.body.data.user.name).toBe('Ada Lovelace');
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
    expect(upgraded.body.data.tokens.accessToken).toEqual(expect.any(String));
    expect(upgraded.body.data.tokens.refreshToken).toEqual(expect.any(String));
    expect(upgraded.body.data.tokens.refreshToken).not.toBe(legacyRefresh);
    expect(upgraded.text).not.toContain(legacyRefresh);
    const rotated = refreshCookieLine(upgraded.headers['set-cookie']);

    const reused = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: legacyRefresh });
    expect(reused.status).toBe(401);

    const refreshed = await asBrowser(request(app).post('/api/auth/refresh')).set('Cookie', cookiePair(rotated));
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

  it('returns the refresh token when the request has no Origin', async () => {
    if (!dbReady) {
      return;
    }

    const nativeEmail = `native-${Date.now()}@example.com`;
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ email: nativeEmail, password });
    expect(registered.status).toBe(201);
    const issued = registered.body.data.tokens.refreshToken as string;
    expect(issued).toEqual(expect.any(String));
    expect(issued.length).toBeGreaterThan(10);
    expect(refreshCookieLine(registered.headers['set-cookie'])).toMatch(/dirah_refresh=/);

    const loggedOut = await request(app).post('/api/auth/logout').send({ refreshToken: issued });
    expect(loggedOut.status).toBe(200);

    const loggedIn = await request(app).post('/api/auth/login').send({ email: nativeEmail, password });
    expect(loggedIn.status).toBe(200);
    const loginRefresh = loggedIn.body.data.tokens.refreshToken as string;
    expect(loginRefresh).toEqual(expect.any(String));
    expect(loggedIn.body.data.user.email).toBe(nativeEmail);

    const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken: loginRefresh });
    expect(refreshed.status).toBe(200);
    const rotated = refreshed.body.data.tokens.refreshToken as string;
    expect(rotated).toEqual(expect.any(String));
    expect(rotated).not.toBe(loginRefresh);

    const browserLogin = await asBrowser(request(app).post('/api/auth/login')).send({
      email: nativeEmail,
      password,
    });
    expect(browserLogin.status).toBe(200);
    expect(browserLogin.body.data.tokens).toEqual({ accessToken: expect.any(String) });
    expect(browserLogin.body.data.tokens.refreshToken).toBeUndefined();
    const browserCookie = decodeURIComponent(
      cookiePair(refreshCookieLine(browserLogin.headers['set-cookie'])).slice('dirah_refresh='.length)
    );
    expect(browserLogin.text).not.toContain(browserCookie);
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

    const misnamed = await request(app)
      .delete(`/api/workspaces/${extraId}`)
      .set('Authorization', `Bearer ${access}`)
      .send({ confirmName: 'Extra' });
    expect(misnamed.status).toBe(400);
    expect(misnamed.body.error).toBe('NAME_MISMATCH');

    const removed = await request(app)
      .delete(`/api/workspaces/${extraId}`)
      .set('Authorization', `Bearer ${access}`)
      .send({ confirmName: 'Extra workspace' });
    expect(removed.status).toBe(200);
    const purgeAt = new Date(removed.body.data.purgeAt as string).getTime();
    expect(purgeAt - Date.now()).toBeGreaterThan(WORKSPACE_PURGE_AFTER_MS - 60_000);

    const gone = await request(app)
      .get(`/api/workspaces/${extraId}`)
      .set('Authorization', `Bearer ${access}`);
    expect(gone.status).toBe(404);

    const listed = await request(app).get('/api/workspaces').set('Authorization', `Bearer ${access}`);
    expect((listed.body.data.workspaces as { id: string }[]).some((item) => item.id === extraId)).toBe(false);

    // Soft-deleted: the row stays until the purge window passes.
    const [kept] = await db.select({ deletedAt: workspaces.deletedAt }).from(workspaces).where(eq(workspaces.id, extraId));
    expect(kept?.deletedAt).toBeInstanceOf(Date);

    const purger = new AuthService(db);
    await purger.purgeDeletedWorkspaces();
    expect(await db.select().from(workspaces).where(eq(workspaces.id, extraId))).toHaveLength(1);

    await purger.purgeDeletedWorkspaces(new Date(Date.now() + WORKSPACE_PURGE_AFTER_MS + 60_000));
    expect(await db.select().from(workspaces).where(eq(workspaces.id, extraId))).toHaveLength(0);
  });

  it('updates email and password, and re-wraps an encryption key', async () => {
    if (!dbReady) {
      return;
    }

    const accountEmail = `profile-${Date.now()}@example.com`;
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ email: accountEmail, password });
    expect(registered.status).toBe(201);
    const access = registered.body.data.tokens.accessToken as string;
    const auth = { Authorization: `Bearer ${access}` };

    const me = await request(app).get('/api/auth/me').set(auth);
    expect(me.status).toBe(200);
    expect(me.body.data.user).toMatchObject({
      email: accountEmail,
      hasPassword: true,
      name: null,
      role: null,
      about: null,
    });

    const profile = await request(app).patch('/api/auth/me').set(auth).send({
      name: 'Ada Lovelace',
      role: 'Engineer',
      about: 'Writes the specs.',
    });
    expect(profile.status).toBe(200);
    expect(profile.body.data.user).toMatchObject({
      email: accountEmail,
      name: 'Ada Lovelace',
      role: 'Engineer',
      about: 'Writes the specs.',
    });

    const tooLong = await request(app).patch('/api/auth/me').set(auth).send({ name: 'n'.repeat(81) });
    expect(tooLong.status).toBe(400);

    const missingPassword = await request(app)
      .patch('/api/auth/me')
      .set(auth)
      .send({ email: `renamed-${accountEmail}` });
    expect(missingPassword.status).toBe(400);
    expect(missingPassword.body.error).toBe('PASSWORD_REQUIRED');

    const wrongPassword = await request(app)
      .patch('/api/auth/me')
      .set(auth)
      .send({ email: `renamed-${accountEmail}`, currentPassword: 'not-the-password' });
    expect(wrongPassword.status).toBe(401);

    const renamed = await request(app)
      .patch('/api/auth/me')
      .set(auth)
      .send({ email: `renamed-${accountEmail}`, currentPassword: password });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.user.email).toBe(`renamed-${accountEmail}`);

    const other = await request(app)
      .post('/api/auth/register')
      .send({ email: `other-${accountEmail}`, password });
    expect(other.status).toBe(201);
    const conflict = await request(app)
      .patch('/api/auth/me')
      .set(auth)
      .send({ email: `other-${accountEmail}`, currentPassword: password });
    expect(conflict.status).toBe(409);

    const storedKey = await request(app).put('/api/auth/crypto').set(auth).send({
      publicKey: 'pk-profile',
      wrappedPrivateKey: 'wrap-old',
      kdfSalt: 'salt-old',
      kdfIterations: 210000,
    });
    expect(storedKey.status).toBe(200);

    const missingRewrap = await request(app)
      .post('/api/auth/password')
      .set(auth)
      .send({ currentPassword: password, newPassword: 'newpassword1' });
    expect(missingRewrap.status).toBe(400);
    expect(missingRewrap.body.error).toBe('CRYPTO_REWRAP_REQUIRED');

    const mismatch = await request(app).post('/api/auth/password').set(auth).send({
      currentPassword: password,
      newPassword: 'newpassword1',
      crypto: {
        publicKey: 'someone-else',
        wrappedPrivateKey: 'wrap-new',
        kdfSalt: 'salt-new',
        kdfIterations: 210000,
      },
    });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error).toBe('CRYPTO_KEY_MISMATCH');

    const changed = await request(app).post('/api/auth/password').set(auth).send({
      currentPassword: password,
      newPassword: 'newpassword1',
      crypto: {
        publicKey: 'pk-profile',
        wrappedPrivateKey: 'wrap-new',
        kdfSalt: 'salt-new',
        kdfIterations: 210000,
      },
    });
    expect(changed.status).toBe(200);
    expect(changed.body.data.user.hasPassword).toBe(true);

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: `renamed-${accountEmail}`, password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: `renamed-${accountEmail}`, password: 'newpassword1' });
    expect(newLogin.status).toBe(200);

    const bundle = await request(app)
      .get('/api/auth/crypto')
      .set('Authorization', `Bearer ${newLogin.body.data.tokens.accessToken as string}`);
    expect(bundle.body.data.crypto.wrappedPrivateKey).toBe('wrap-new');
    expect(bundle.body.data.crypto.publicKey).toBe('pk-profile');
  });

  it('sends a password reset code only for an existing account, then accepts it once', async () => {
    if (!dbReady) {
      return;
    }

    const unknown = `missing-${Date.now()}@example.com`;
    const first = await request(app).post('/api/auth/password/forgot').send({ email: unknown });
    expect(first.status).toBe(200);
    expect(first.body.message).toBe('If an account exists for that email, we sent a code.');
    const unknownLogs = await db.select().from(emailLogs).where(eq(emailLogs.to, unknown));
    expect(unknownLogs).toHaveLength(0);

    const resentUnknown = await request(app).post('/api/auth/password/forgot').send({ email: unknown });
    expect(resentUnknown.status).toBe(429);
    expect(resentUnknown.body.error).toBe('RATE_LIMITED');
    expect(resentUnknown.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(resentUnknown.body.retryAfterSeconds).toBeLessThanOrEqual(60);

    const accountEmail = `reset-${Date.now()}@example.com`;
    const registered = await asBrowser(request(app).post('/api/auth/register')).send({
      email: accountEmail,
      password,
    });
    expect(registered.status).toBe(201);
    const userId = registered.body.data.user.id as string;
    const oldRefresh = decodeURIComponent(
      cookiePair(refreshCookieLine(registered.headers['set-cookie'])).slice('dirah_refresh='.length)
    );

    const sent = await request(app).post('/api/auth/password/forgot').send({ email: accountEmail });
    expect(sent.status).toBe(200);
    expect(sent.body.message).toBe(first.body.message);
    const code = passwordResetCodeForTests(accountEmail);
    expect(code).toMatch(/^\d{6}$/);
    expect(JSON.stringify(sent.body)).not.toContain(code);

    const [stored] = await db
      .select()
      .from(passwordResetCodes)
      .where(eq(passwordResetCodes.userId, userId));
    expect(stored.codeHash).toHaveLength(64);
    expect(stored.codeHash).not.toBe(code);
    const sentLogs = await db.select().from(emailLogs).where(eq(emailLogs.to, accountEmail));
    expect(sentLogs.length).toBeGreaterThan(0);
    expect(sentLogs.every((row) => row.subject !== undefined && !row.subject.includes(code!))).toBe(true);
    expect(sentLogs.every((row) => JSON.stringify(row.meta ?? {}) === JSON.stringify({ purpose: 'password_reset' }))).toBe(true);

    const resent = await request(app).post('/api/auth/password/forgot').send({ email: accountEmail });
    expect(resent.status).toBe(429);
    expect(resent.body.error).toBe('RATE_LIMITED');
    expect(resent.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(resent.body.retryAfterSeconds).toBeLessThanOrEqual(60);

    const wrongCode = code === '000000' ? '111111' : '000000';
    const wrong = await request(app)
      .post('/api/auth/password/reset')
      .send({ email: accountEmail, code: wrongCode, password: 'newpassword1' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe('INVALID_CODE');
    const [attempted] = await db
      .select()
      .from(passwordResetCodes)
      .where(eq(passwordResetCodes.userId, userId));
    expect(attempted.attempts).toBe(1);

    const reset = await request(app)
      .post('/api/auth/password/reset')
      .send({ email: accountEmail, code, password: 'newpassword1' });
    expect(reset.status).toBe(200);
    expect(reset.body.data.hasEncryptionKey).toBe(false);

    const reused = await request(app)
      .post('/api/auth/password/reset')
      .send({ email: accountEmail, code, password: 'anotherpass1' });
    expect(reused.status).toBe(400);
    expect(reused.body.error).toBe('INVALID_CODE');

    const oldSession = await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh });
    expect(oldSession.status).toBe(401);

    const loggedIn = await request(app)
      .post('/api/auth/login')
      .send({ email: accountEmail, password: 'newpassword1' });
    expect(loggedIn.status).toBe(200);
  });
});
