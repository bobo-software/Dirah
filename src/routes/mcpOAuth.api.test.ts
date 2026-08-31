import crypto from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { db } from '../db';

const stamp = Date.now();
const ownerEmail = `phase6-mcp-oauth-${stamp}@example.com`;
const password = 'password12';

function pkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

describe('MCP OAuth 2.1', () => {
  let app: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping MCP OAuth tests: database unavailable', error);
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
  });

  it('registers a client, approves with PKCE, and uses the access token on /mcp', async () => {
    const meta = await request(app).get('/.well-known/oauth-authorization-server');
    expect(meta.status).toBe(200);
    expect(meta.body.authorization_endpoint).toContain('/mcp/oauth/authorize');

    const resource = await request(app).get('/.well-known/oauth-protected-resource');
    expect(resource.body.resource).toContain('/mcp');

    if (!dbReady) return;

    const owner = await request(app).post('/api/auth/register').send({ email: ownerEmail, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;
    await request(app)
      .put('/api/mcp/access')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId, canWrite: false }] });

    const redirectUri = 'http://localhost:9999/callback';
    const registered = await request(app)
      .post('/mcp/oauth/register')
      .send({ client_name: 'Cursor', redirect_uris: [redirectUri] });
    expect(registered.status).toBe(201);
    const clientId = registered.body.client_id as string;

    const { verifier, challenge } = pkce();
    const approve = await request(app)
      .post('/api/mcp/oauth/approve')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        clientId,
        redirectUri,
        codeChallenge: challenge,
        state: 'abc',
      });
    expect(approve.status).toBe(200);
    const redirectTo = approve.body.data.redirectTo as string;
    expect(redirectTo).toContain('code=');
    const code = new URL(redirectTo).searchParams.get('code');
    expect(code).toBeTruthy();

    const token = await request(app).post('/mcp/oauth/token').send({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    });
    expect(token.status).toBe(200);
    const access = token.body.access_token as string;
    expect(access).toBeTruthy();

    const listed = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', `Bearer ${access}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_workspaces', arguments: {} } });
    expect(listed.status).toBe(200);

    const authorize = await request(app).get('/mcp/oauth/authorize').query({
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
    });
    expect(authorize.status).toBe(302);
    expect(String(authorize.headers.location)).toContain('/settings/mcp-oauth');
  });
});
