import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { db } from '../db';
import { env } from '../config/env';

const stamp = Date.now();
const password = 'password12';
const redirectUri = 'https://claude.ai/api/mcp/auth_callback';

function pkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function callMcp(app: Express, accessToken: string) {
  return request(app)
    .post('/mcp')
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json, text/event-stream')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_workspaces', arguments: {} } });
}

describe('MCP OAuth 2.1', () => {
  let app: Express;
  let dbReady = false;
  let resource: string;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping MCP OAuth tests: database unavailable', error);
      // Set ALLOW_DB_SKIP=1 to run without Postgres; otherwise a missing database must fail, not pass.
      if (process.env.ALLOW_DB_SKIP !== '1') throw error;
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
    resource = `${env.apiPublicUrl.replace(/\/+$/, '')}/mcp`;
  });

  async function registerUser(label: string) {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `mcp-oauth-${label}-${stamp}@example.com`, password });
    return {
      jwt: res.body.data.tokens.accessToken as string,
      workspaceId: res.body.data.workspace.id as string,
    };
  }

  async function registerClient(name = 'Claude') {
    const res = await request(app)
      .post('/mcp/oauth/register')
      .send({ client_name: name, redirect_uris: [redirectUri] });
    expect(res.status).toBe(201);
    return res.body.client_id as string;
  }

  /** Full browser-side dance: approve on the consent page, then exchange the code (form-encoded). */
  async function connect(userJwt: string, clientId: string, workspaceId: string) {
    const { verifier, challenge } = pkce();
    const approve = await request(app)
      .post('/api/mcp/oauth/approve')
      .set('Authorization', `Bearer ${userJwt}`)
      .send({
        clientId,
        redirectUri,
        codeChallenge: challenge,
        state: 'abc',
        resource,
        workspaces: [{ workspaceId, canWrite: false }],
      });
    expect(approve.status).toBe(200);
    const redirectTo = new URL(approve.body.data.redirectTo as string);
    expect(redirectTo.searchParams.get('state')).toBe('abc');
    const code = redirectTo.searchParams.get('code');
    expect(code).toBeTruthy();

    const token = await request(app)
      .post('/mcp/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: code!,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
        resource,
      });
    expect(token.status).toBe(200);
    expect(token.headers['cache-control']).toBe('no-store');
    expect(token.body.refresh_token).toBeTruthy();
    return {
      access: token.body.access_token as string,
      refresh: token.body.refresh_token as string,
      code: code!,
      verifier,
    };
  }

  function refreshWith(clientId: string, refreshToken: string) {
    return request(app)
      .post('/mcp/oauth/token')
      .send({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId });
  }

  it('serves discovery metadata with open CORS', async () => {
    const meta = await request(app).get('/.well-known/oauth-authorization-server').set('Origin', 'https://claude.ai');
    expect(meta.status).toBe(200);
    expect(meta.headers['access-control-allow-origin']).toBe('*');
    expect(meta.body.authorization_endpoint).toContain('/mcp/oauth/authorize');
    expect(meta.body.grant_types_supported).toContain('refresh_token');

    for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.body.resource).toBe(resource);
    }

    const unauth = await request(app).post('/mcp').send({});
    expect(unauth.status).toBe(401);
    expect(unauth.headers['www-authenticate']).toContain('resource_metadata=');
  });

  it('connects end to end, grants chosen workspaces, and refreshes with rotation', async () => {
    if (!dbReady) return;
    const user = await registerUser('e2e');
    const clientId = await registerClient();
    const { access, refresh, code, verifier } = await connect(user.jwt, clientId, user.workspaceId);

    const listed = await callMcp(app, access);
    expect(listed.status).toBe(200);
    expect(listed.text).toContain(user.workspaceId);

    // Codes are single use.
    const replay = await request(app).post('/mcp/oauth/token').send({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe('invalid_grant');

    const refreshed = await request(app)
      .post('/mcp/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId });
    expect(refreshed.status).toBe(200);
    const nextRefresh = refreshed.body.refresh_token as string;
    expect(nextRefresh).not.toBe(refresh);
    expect((await callMcp(app, refreshed.body.access_token)).status).toBe(200);

    // A retry right after rotation (lost response, second window) is forgiven.
    const retried = await refreshWith(clientId, refresh);
    expect(retried.status).toBe(200);
    expect((await callMcp(app, retried.body.access_token)).status).toBe(200);

    // Once the grace window passes, the stale token is rejected but the chain survives.
    await pool.query(
      `UPDATE mcp_oauth_refresh_tokens SET used_at = now() - interval '5 minutes' WHERE token_hash = $1`,
      [sha256(refresh)]
    );
    const stale = await refreshWith(clientId, refresh);
    expect(stale.body.error).toBe('invalid_grant');
    expect((await refreshWith(clientId, nextRefresh)).status).toBe(200);
  });

  it('survives concurrent refreshes of the same token', async () => {
    if (!dbReady) return;
    const user = await registerUser('concurrent');
    const clientId = await registerClient('Cursor');
    const { refresh } = await connect(user.jwt, clientId, user.workspaceId);

    const results = await Promise.all([refreshWith(clientId, refresh), refreshWith(clientId, refresh)]);
    for (const res of results) {
      expect(res.status).toBe(200);
      expect((await callMcp(app, res.body.access_token)).status).toBe(200);
    }
    for (const res of results) {
      expect((await refreshWith(clientId, res.body.refresh_token)).status).toBe(200);
    }
  });

  it('revoking the connection stops access and refresh, and the app can reconnect', async () => {
    if (!dbReady) return;
    const user = await registerUser('revoke');
    const clientId = await registerClient();
    const first = await connect(user.jwt, clientId, user.workspaceId);

    const tokens = await request(app).get('/api/mcp/tokens').set('Authorization', `Bearer ${user.jwt}`);
    const oauthToken = (tokens.body.data.tokens as Array<{ id: string; oauthClientId: string | null }>).find(
      (t) => t.oauthClientId === clientId
    );
    expect(oauthToken).toBeTruthy();
    const revoked = await request(app)
      .delete(`/api/mcp/tokens/${oauthToken!.id}`)
      .set('Authorization', `Bearer ${user.jwt}`);
    expect(revoked.status).toBeLessThan(300);

    expect((await callMcp(app, first.access)).status).toBe(401);
    const refresh = await request(app)
      .post('/mcp/oauth/token')
      .send({ grant_type: 'refresh_token', refresh_token: first.refresh, client_id: clientId });
    expect(refresh.body.error).toBe('invalid_grant');

    // Previously a unique constraint on (user, client) made this 500.
    const second = await connect(user.jwt, clientId, user.workspaceId);
    expect((await callMcp(app, second.access)).status).toBe(200);
  });

  it('validates authorize requests before sending the user to log in', async () => {
    if (!dbReady) return;
    const clientId = await registerClient();
    const { challenge } = pkce();
    const base = {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
      resource,
    };

    const ok = await request(app).get('/mcp/oauth/authorize').query(base);
    expect(ok.status).toBe(302);
    const consent = new URL(String(ok.headers.location));
    expect(consent.pathname).toBe('/settings/mcp-oauth');
    expect(consent.searchParams.get('resource')).toBe(resource);

    const unknownClient = await request(app).get('/mcp/oauth/authorize').query({ ...base, client_id: 'nope' });
    expect(unknownClient.status).toBe(400);
    expect(unknownClient.headers.location).toBeUndefined();

    const badRedirect = await request(app)
      .get('/mcp/oauth/authorize')
      .query({ ...base, redirect_uri: 'https://evil.example/cb' });
    expect(badRedirect.status).toBe(400);
    expect(badRedirect.headers.location).toBeUndefined();

    const plainPkce = await request(app)
      .get('/mcp/oauth/authorize')
      .query({ ...base, code_challenge_method: 'plain' });
    expect(plainPkce.status).toBe(302);
    const back = new URL(String(plainPkce.headers.location));
    expect(back.origin + back.pathname).toBe(redirectUri);
    expect(back.searchParams.get('error')).toBe('invalid_request');
    expect(back.searchParams.get('state')).toBe('xyz');

    const wrongResource = await request(app)
      .get('/mcp/oauth/authorize')
      .query({ ...base, resource: 'https://other.example/mcp' });
    expect(new URL(String(wrongResource.headers.location)).searchParams.get('error')).toBe('invalid_target');
  });

  it('lets the user deny, and requires at least one workspace to approve', async () => {
    if (!dbReady) return;
    const user = await registerUser('deny');
    const clientId = await registerClient();
    const { challenge } = pkce();

    const denied = await request(app)
      .post('/api/mcp/oauth/approve')
      .set('Authorization', `Bearer ${user.jwt}`)
      .send({ clientId, redirectUri, state: 's', deny: true });
    expect(denied.status).toBe(200);
    const target = new URL(denied.body.data.redirectTo as string);
    expect(target.searchParams.get('error')).toBe('access_denied');
    expect(target.searchParams.get('code')).toBeNull();

    const empty = await request(app)
      .post('/api/mcp/oauth/approve')
      .set('Authorization', `Bearer ${user.jwt}`)
      .send({ clientId, redirectUri, codeChallenge: challenge, workspaces: [] });
    expect(empty.status).toBe(400);

    const client = await request(app)
      .get('/api/mcp/oauth/client')
      .query({ client_id: clientId, redirect_uri: redirectUri })
      .set('Authorization', `Bearer ${user.jwt}`);
    expect(client.body.data).toMatchObject({ clientName: 'Claude', redirectHost: 'claude.ai' });
  });

  it('rejects unsafe redirect URIs at registration', async () => {
    if (!dbReady) return;
    for (const uri of ['javascript:alert(1)', 'http://evil.example/cb', 'data:text/html,hi']) {
      const res = await request(app).post('/mcp/oauth/register').send({ redirect_uris: [uri] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_redirect_uri');
    }
    for (const uri of ['http://localhost:6274/oauth/callback', 'http://127.0.0.1:33418/cb', 'cursor://anysphere.cursor-retrieval/oauth/callback']) {
      const res = await request(app).post('/mcp/oauth/register').send({ redirect_uris: [uri] });
      expect(res.status).toBe(201);
    }
  });

  it('rejects MCP JWTs minted for a different audience', async () => {
    if (!dbReady) return;
    const user = await registerUser('aud');
    const clientId = await registerClient();
    const { access } = await connect(user.jwt, clientId, user.workspaceId);
    const payload = jwt.decode(access) as { userId: string; tokenId: string };
    const forged = jwt.sign(
      { userId: payload.userId, role: 'mcp', tokenId: payload.tokenId },
      env.jwtSecret,
      { expiresIn: 60, audience: 'https://other.example/mcp' }
    );
    const res = await callMcp(app, forged);
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain('error="invalid_token"');
  });
});
