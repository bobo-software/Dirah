import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { WebSocket } from 'ws';
import type { Express } from 'express';
import { createApp, getDocSync } from '../app';
import { attachDocSync } from '../sync/attachDocSync';
import { pool, db } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';

const stamp = Date.now();
const ownerEmail = `phase3-owner-${stamp}@example.com`;
const editorEmail = `phase3-editor-${stamp}@example.com`;
const viewerEmail = `phase3-viewer-${stamp}@example.com`;
const strangerEmail = `phase3-stranger-${stamp}@example.com`;
const password = 'password12';

function waitJson(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData) => {
      cleanup();
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    };
    const onClose = (code: number) => {
      cleanup();
      reject(new Error(`closed ${code}`));
    };
    const cleanup = () => {
      ws.off('message', onMessage);
      ws.off('close', onClose);
    };
    ws.on('message', onMessage);
    ws.on('close', onClose);
  });
}

function waitForType(
  ws: WebSocket,
  type: string,
  timeoutMs = 4000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${type}`));
    }, timeoutMs);
    const onMessage = (data: WebSocket.RawData) => {
      const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
      if (parsed.type !== type) return;
      cleanup();
      resolve(parsed);
    };
    const onClose = (code: number) => {
      cleanup();
      reject(new Error(`closed ${code}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('close', onClose);
    };
    ws.on('message', onMessage);
    ws.on('close', onClose);
  });
}

async function openSync(port: number, token?: string, share?: string): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/sync`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  if (share) {
    ws.send(JSON.stringify({ type: 'auth', share }));
  } else if (token) {
    ws.send(JSON.stringify({ type: 'auth', token }));
  }
  expect((await waitJson(ws)).type).toBe('ready');
  return ws;
}

describe('sharing API', () => {
  let app: Express;
  let dbReady = false;
  let server: http.Server;
  let port = 0;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping sharing API tests: database unavailable', error);
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
    server = http.createServer(app);
    attachDocSync(server, getDocSync(app));
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('members, roles, public share, and sync authz', async () => {
    if (!dbReady) {
      return;
    }

    const owner = await request(app).post('/api/auth/register').send({ email: ownerEmail, password });
    expect(owner.status).toBe(201);
    const ownerToken = owner.body.data.tokens.accessToken as string;
    const ownerId = owner.body.data.user.id as string;
    const workspaceId = owner.body.data.workspace.id as string;

    const editor = await request(app).post('/api/auth/register').send({ email: editorEmail, password });
    const editorToken = editor.body.data.tokens.accessToken as string;
    const editorId = editor.body.data.user.id as string;

    const viewer = await request(app).post('/api/auth/register').send({ email: viewerEmail, password });
    const viewerToken = viewer.body.data.tokens.accessToken as string;

    const stranger = await request(app)
      .post('/api/auth/register')
      .send({ email: strangerEmail, password });
    const strangerToken = stranger.body.data.tokens.accessToken as string;

    const unknown = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'nobody-here@example.com', role: 'editor' });
    expect(unknown.status).toBe(201);
    expect(unknown.body.data.invite.email).toBe('nobody-here@example.com');
    expect(unknown.body.data.invite.inviteUrl).toMatch(/\/invite\//);

    const invitedEditor = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: editorEmail, role: 'editor' });
    expect(invitedEditor.status).toBe(201);

    const invitedViewer = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: viewerEmail, role: 'viewer' });
    expect(invitedViewer.status).toBe(201);

    const editorSees = await request(app)
      .get(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(editorSees.status).toBe(200);
    expect(editorSees.body.data.workspace.role).toBe('editor');

    const strangerForbidden = await request(app)
      .get(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(strangerForbidden.status).toBe(403);

    const page = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ title: 'Shared' });
    expect(page.status).toBe(201);
    const pageId = page.body.data.page.id as string;

    const viewerPatch = await request(app)
      .patch(`/api/pages/${pageId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ title: 'Nope' });
    expect(viewerPatch.status).toBe(403);

    const lastOwner = await request(app)
      .delete(`/api/workspaces/${workspaceId}/members/${ownerId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(lastOwner.status).toBe(400);

    const lastOwnerDemote = await request(app)
      .patch(`/api/workspaces/${workspaceId}/members/${ownerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'viewer' });
    expect(lastOwnerDemote.status).toBe(400);

    const share = await request(app)
      .post(`/api/pages/${pageId}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permission: 'view' });
    expect(share.status).toBe(201);
    const token = share.body.data.share.token as string;

    const publicPage = await request(app).get(`/api/public/pages/${token}`);
    expect(publicPage.status).toBe(200);
    expect(publicPage.body.data.page.id).toBe(pageId);
    expect(publicPage.body.data.page).not.toHaveProperty('pages');

    const publicSiblings = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(publicSiblings.status).toBe(403);

    const editorWs = await openSync(port, editorToken);
    editorWs.send(JSON.stringify({ type: 'join', workspaceId, docId: pageId, clock: 0 }));
    expect((await waitJson(editorWs)).type).toBe('init');
    editorWs.send(
      JSON.stringify({
        type: 'push',
        docId: pageId,
        update: Buffer.from('e30=', 'base64').toString('base64'),
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 80));

    const viewerWs = await openSync(port, viewerToken);
    viewerWs.send(JSON.stringify({ type: 'join', workspaceId, docId: pageId, clock: 0 }));
    expect((await waitJson(viewerWs)).type).toBe('init');
    viewerWs.send(
      JSON.stringify({
        type: 'push',
        docId: pageId,
        update: Buffer.from('e30=', 'base64').toString('base64'),
      })
    );
    const viewerDenied = await waitJson(viewerWs);
    expect(viewerDenied.type).toBe('error');
    expect(viewerDenied.code).toBe('FORBIDDEN');

    const pendingPresence = waitForType(editorWs, 'awareness');
    viewerWs.send(
      JSON.stringify({
        type: 'awareness',
        docId: pageId,
        clientId: 99,
        update: Buffer.from('viewer-aw').toString('base64'),
      })
    );
    const viewerPresence = await pendingPresence;
    expect(viewerPresence.clientId).toBe(99);

    const publicWs = await openSync(port, undefined, token);
    publicWs.send(JSON.stringify({ type: 'join', workspaceId, docId: pageId, clock: 0 }));
    expect((await waitJson(publicWs)).type).toBe('init');
    publicWs.send(
      JSON.stringify({
        type: 'push',
        docId: pageId,
        update: Buffer.from('e30=', 'base64').toString('base64'),
      })
    );
    const publicDenied = await waitJson(publicWs);
    expect(publicDenied.type).toBe('error');
    expect(publicDenied.code).toBe('FORBIDDEN');

    const blobBytes = Buffer.from('share-blob-zymurgy');
    const uploaded = await request(app)
      .post(`/api/workspaces/${workspaceId}/blobs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Content-Type', 'text/plain')
      .send(blobBytes);
    expect(uploaded.status).toBe(201);
    const blobId = uploaded.body.data.blob.id as string;

    const publicBlob = await request(app).get(`/api/public/pages/${token}/blobs/${blobId}`);
    expect(publicBlob.status).toBe(200);
    expect(publicBlob.headers['content-type']).toMatch(/text\/plain/);
    expect(publicBlob.text).toBe('share-blob-zymurgy');

    const strangerBlob = await request(app)
      .get(`/api/blobs/${blobId}`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(strangerBlob.status).toBe(403);

    await request(app)
      .delete(`/api/pages/${pageId}/share`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const revoked = await request(app).get(`/api/public/pages/${token}`);
    expect(revoked.status).toBe(404);

    const removed = await request(app)
      .delete(`/api/workspaces/${workspaceId}/members/${editorId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(removed.status).toBe(200);

    editorWs.close();
    viewerWs.close();
    publicWs.close();
  });
});
