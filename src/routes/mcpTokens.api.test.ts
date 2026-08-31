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
    expect(secret.startsWith('dira_mcp_')).toBe(true);
    expect(created.body.data.token).not.toHaveProperty('tokenHash');

    const listed = await request(app)
      .get('/api/mcp/tokens')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.tokens).toHaveLength(1);
    expect(listed.body.data.tokens[0].secret).toBeUndefined();

    const empty = await request(app)
      .get('/api/mcp/access')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(empty.body.data.workspaces[0].allowlisted).toBe(false);

    const allowed = await request(app)
      .put('/api/mcp/access')
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

    const viewerAccess = await request(app)
      .put('/api/mcp/access')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });
    expect(viewerAccess.status).toBe(200);
    const row = viewerAccess.body.data.workspaces.find(
      (item: { workspaceId: string }) => item.workspaceId === workspaceId
    );
    expect(row.canWrite).toBe(false);

    const revoked = await request(app)
      .delete(`/api/mcp/tokens/${created.body.data.token.id}`)
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

    await request(app)
      .put('/api/mcp/access')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });

    const off = await request(app)
      .patch(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ mcpEnabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data.workspace.mcpEnabled).toBe(false);

    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'agent' });
    const secret = tokenRes.body.data.token.secret as string;
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
    const text = JSON.stringify(listed.body ?? listed.text);
    expect(text.includes('MCP_DISABLED') || text.includes('disabled')).toBe(true);
  });
});
