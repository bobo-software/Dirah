import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { db } from '../db';

const stamp = Date.now();
const ownerEmail = `phase6-pat-owner-${stamp}@example.com`;
const viewerEmail = `phase6-pat-viewer-${stamp}@example.com`;
const password = 'password12';

describe('MCP PAT and allowlist API', () => {
  let app: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping MCP PAT tests: database unavailable', error);
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
  });

  it('issues hashed tokens, empty allowlist by default, and viewers cannot grant write', async () => {
    if (!dbReady) return;

    const owner = await request(app).post('/api/auth/register').send({ email: ownerEmail, password });
    expect(owner.status).toBe(201);
    const ownerToken = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;

    const created = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Cursor' });
    expect(created.status).toBe(201);
    const secret = created.body.data.token.secret as string;
    const tokenId = created.body.data.token.id as string;
    expect(secret.startsWith('dira_mcp_')).toBe(true);
    expect(created.body.data.token).not.toHaveProperty('tokenHash');

    const listed = await request(app)
      .get('/api/mcp/tokens')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.tokens).toHaveLength(1);
    expect(listed.body.data.tokens[0].secret).toBeUndefined();

    const empty = await request(app)
      .get(`/api/mcp/tokens/${tokenId}/access`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(empty.body.data.workspaces[0].allowlisted).toBe(false);

    const allowed = await request(app)
      .put(`/api/mcp/tokens/${tokenId}/access`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.workspaces[0].allowlisted).toBe(true);
    expect(allowed.body.data.workspaces[0].canWrite).toBe(true);

    const viewer = await request(app)
      .post('/api/auth/register')
      .send({ email: viewerEmail, password });
    const viewerToken = viewer.body.data.tokens.accessToken as string;
    await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: viewerEmail, role: 'viewer' });

    // Under the per-token model, a viewer must have their own token before they
    // can grant it any access. This still verifies the core invariant: a viewer's
    // role caps canWrite to false regardless of what they request.
    const viewerCreated = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'viewer token' });
    expect(viewerCreated.status).toBe(201);
    const viewerTokenId = viewerCreated.body.data.token.id as string;

    const viewerAccess = await request(app)
      .put(`/api/mcp/tokens/${viewerTokenId}/access`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });
    expect(viewerAccess.status).toBe(200);
    const row = viewerAccess.body.data.workspaces.find(
      (item: { workspaceId: string }) => item.workspaceId === workspaceId
    );
    expect(row.canWrite).toBe(false);

    const revoked = await request(app)
      .delete(`/api/mcp/tokens/${tokenId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(revoked.status).toBe(200);
  });

  it('owner can disable MCP for a workspace', async () => {
    if (!dbReady) return;
    const email = `phase6-pat-kill-${Date.now()}@example.com`;
    const owner = await request(app).post('/api/auth/register').send({ email, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;
    expect(owner.body.data.workspace.mcpEnabled).toBe(true);

    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'agent' });
    const secret = tokenRes.body.data.token.secret as string;
    const tokenId = tokenRes.body.data.token.id as string;

    await request(app)
      .put(`/api/mcp/tokens/${tokenId}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });

    const off = await request(app)
      .patch(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ mcpEnabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data.workspace.mcpEnabled).toBe(false);

    const listed = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', `Bearer ${secret}`)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'list_tree', arguments: { workspaceId } },
      });
    const text = JSON.stringify(listed.body?.result ? listed.body : listed.text);
    expect(text.includes('MCP_DISABLED') || text.includes('disabled')).toBe(true);
  });

  it('sets, updates, and clears a token default workspace', async () => {
    if (!dbReady) return;
    const email = `phase8-default-ws-${Date.now()}@example.com`;
    const owner = await request(app).post('/api/auth/register').send({ email, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;

    const secondWs = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'Second Workspace' });
    const otherOwnerWsId = secondWs.body.data.workspace.id as string;

    const thirdWs = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'Third Workspace (never granted)' });
    const ungrantedWsId = thirdWs.body.data.workspace.id as string;

    const foreignOwner = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase8-default-ws-foreign-${Date.now()}@example.com`, password });
    const foreignWorkspaceId = foreignOwner.body.data.workspace.id as string;

    // Create the token with an initial grant + default workspace in one shot.
    const created = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        name: 'agent',
        defaultWorkspaceId: workspaceId,
        workspaceAccess: [{ workspaceId, canWrite: true }],
      });
    expect(created.status).toBe(201);
    expect(created.body.data.token.defaultWorkspaceId).toBe(workspaceId);
    const tokenId = created.body.data.token.id as string;

    // Grant both workspaces so the default can move to the second one.
    const granted = await request(app)
      .put(`/api/mcp/tokens/${tokenId}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        workspaces: [
          { workspaceId, canWrite: true },
          { workspaceId: otherOwnerWsId, canWrite: true },
        ],
      });
    expect(granted.status).toBe(200);

    const patched = await request(app)
      .patch(`/api/mcp/tokens/${tokenId}`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ defaultWorkspaceId: otherOwnerWsId });
    expect(patched.status).toBe(200);
    expect(patched.body.data.token.defaultWorkspaceId).toBe(otherOwnerWsId);

    const cleared = await request(app)
      .patch(`/api/mcp/tokens/${tokenId}`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ defaultWorkspaceId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.token.defaultWorkspaceId).toBeNull();

    // A real workspace the user owns, but never granted to this token: rejected.
    const rejectedUngranted = await request(app)
      .patch(`/api/mcp/tokens/${tokenId}`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ defaultWorkspaceId: ungrantedWsId });
    expect(rejectedUngranted.status).toBe(409);
    expect(rejectedUngranted.body.error ?? rejectedUngranted.body.code).toBe('DEFAULT_NOT_GRANTED');

    // A workspace outside the user's own memberships is, by construction, never
    // in the token's grant set either — so it produces the same 409, not a 404.
    const rejectedForeign = await request(app)
      .patch(`/api/mcp/tokens/${tokenId}`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ defaultWorkspaceId: foreignWorkspaceId });
    expect(rejectedForeign.status).toBe(409);
    expect(rejectedForeign.body.error ?? rejectedForeign.body.code).toBe('DEFAULT_NOT_GRANTED');
  });

  it('grants are per-token, not shared across a user\'s tokens', async () => {
    if (!dbReady) return;
    const email = `phase-per-token-${Date.now()}@example.com`;
    const owner = await request(app).post('/api/auth/register').send({ email, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const wsA = owner.body.data.workspace.id as string;

    const wsBRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'Workspace B' });
    const wsB = wsBRes.body.data.workspace.id as string;

    const token1 = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'token-1' });
    const token1Id = token1.body.data.token.id as string;

    const token2 = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'token-2' });
    const token2Id = token2.body.data.token.id as string;

    await request(app)
      .put(`/api/mcp/tokens/${token1Id}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId: wsA, canWrite: true }] });

    await request(app)
      .put(`/api/mcp/tokens/${token2Id}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId: wsB, canWrite: true }] });

    const token1Access = await request(app)
      .get(`/api/mcp/tokens/${token1Id}/access`)
      .set('Authorization', `Bearer ${jwt}`);
    const t1A = token1Access.body.data.workspaces.find((w: { workspaceId: string }) => w.workspaceId === wsA);
    const t1B = token1Access.body.data.workspaces.find((w: { workspaceId: string }) => w.workspaceId === wsB);
    expect(t1A.allowlisted).toBe(true);
    expect(t1B.allowlisted).toBe(false);

    const token2Access = await request(app)
      .get(`/api/mcp/tokens/${token2Id}/access`)
      .set('Authorization', `Bearer ${jwt}`);
    const t2A = token2Access.body.data.workspaces.find((w: { workspaceId: string }) => w.workspaceId === wsA);
    const t2B = token2Access.body.data.workspaces.find((w: { workspaceId: string }) => w.workspaceId === wsB);
    expect(t2A.allowlisted).toBe(false);
    expect(t2B.allowlisted).toBe(true);
  });

  it('rejects access reads/writes for a token id that is not owned by the requester', async () => {
    if (!dbReady) return;
    const ownerA = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase-not-owned-a-${Date.now()}@example.com`, password });
    const jwtA = ownerA.body.data.tokens.accessToken as string;

    const ownerB = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase-not-owned-b-${Date.now()}@example.com`, password });
    const jwtB = ownerB.body.data.tokens.accessToken as string;
    const wsB = ownerB.body.data.workspace.id as string;

    const tokenB = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwtB}`)
      .send({ name: 'b-token' });
    const tokenBId = tokenB.body.data.token.id as string;

    const getRes = await request(app)
      .get(`/api/mcp/tokens/${tokenBId}/access`)
      .set('Authorization', `Bearer ${jwtA}`);
    expect(getRes.status).toBe(404);

    const setRes = await request(app)
      .put(`/api/mcp/tokens/${tokenBId}/access`)
      .set('Authorization', `Bearer ${jwtA}`)
      .send({ workspaces: [{ workspaceId: wsB, canWrite: true }] });
    expect(setRes.status).toBe(404);
  });
});
