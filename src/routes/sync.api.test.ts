import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { WebSocket } from 'ws';
import type { Express } from 'express';
import { createApp, getDocSync } from '../app';
import { attachDocSync } from '../sync/attachDocSync';
import { pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { db } from '../db';
import * as Y from 'yjs';

const stamp = Date.now();
const ownerEmail = `phase2-owner-${stamp}@example.com`;
const otherEmail = `phase2-other-${stamp}@example.com`;
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

describe('sync and blobs API', () => {
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
      console.warn('Skipping sync API tests: database unavailable', error);
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

  it('GET /api/pages/:id/updates without a token is 401', async () => {
    const res = await request(app).get(
      '/api/pages/00000000-0000-4000-8000-000000000001/updates'
    );
    expect(res.status).toBe(401);
  });

  it('owner can sync updates and blobs; other user is 403', async () => {
    if (!dbReady) {
      return;
    }

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: ownerEmail, password });
    expect(owner.status).toBe(201);
    const ownerToken = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;

    const other = await request(app)
      .post('/api/auth/register')
      .send({ email: otherEmail, password });
    const otherToken = other.body.data.tokens.accessToken as string;

    const page = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Synced' });
    expect(page.status).toBe(201);
    const pageId = page.body.data.page.id as string;

    const forbiddenUpdates = await request(app)
      .get(`/api/pages/${pageId}/updates`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(forbiddenUpdates.status).toBe(403);

    const forbiddenBlob = await request(app)
      .post(`/api/workspaces/${workspaceId}/blobs`)
      .set('Authorization', `Bearer ${otherToken}`)
      .set('Content-Type', 'text/plain')
      .send(Buffer.from('nope'));
    expect(forbiddenBlob.status).toBe(403);

    const uploaded = await request(app)
      .post(`/api/workspaces/${workspaceId}/blobs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Content-Type', 'text/plain')
      .send(Buffer.from('hello-blob'));
    expect(uploaded.status).toBe(201);
    const blobId = uploaded.body.data.blob.id as string;

    const downloaded = await request(app)
      .get(`/api/blobs/${blobId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers['content-type']).toMatch(/text\/plain/);
    expect(downloaded.text).toBe('hello-blob');

    const otherBlob = await request(app)
      .get(`/api/blobs/${blobId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(otherBlob.status).toBe(403);

    const empty = await request(app)
      .get(`/api/pages/${pageId}/updates`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data.updates).toEqual([]);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/sync`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({ type: 'auth', token: ownerToken }));
    expect((await waitJson(ws)).type).toBe('ready');
    ws.send(
      JSON.stringify({ type: 'join', workspaceId, docId: pageId, clock: 0 })
    );
    const init = await waitJson(ws);
    expect(init.type).toBe('init');

    const ydoc = new Y.Doc();
    ydoc.getMap('dira').set('n', 1);
    const payload = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64');
    ws.send(JSON.stringify({ type: 'push', docId: pageId, update: payload }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    const listed = await request(app)
      .get(`/api/pages/${pageId}/updates`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listed.body.data.updates.length).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < 3; i += 1) {
      ydoc.getMap('dira').set('n', i + 2);
      ws.send(
        JSON.stringify({
          type: 'push',
          docId: pageId,
          update: Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64'),
        })
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));

    const afterSnap = await request(app)
      .get(`/api/pages/${pageId}/updates?clock=0`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(afterSnap.body.data.snapshot).toBeTruthy();

    const forbiddenJoin = new WebSocket(`ws://127.0.0.1:${port}/sync`);
    await new Promise<void>((resolve, reject) => {
      forbiddenJoin.once('open', resolve);
      forbiddenJoin.once('error', reject);
    });
    forbiddenJoin.send(JSON.stringify({ type: 'auth', token: otherToken }));
    expect((await waitJson(forbiddenJoin)).type).toBe('ready');
    forbiddenJoin.send(
      JSON.stringify({ type: 'join', workspaceId, docId: pageId, clock: 0 })
    );
    const denied = await waitJson(forbiddenJoin);
    expect(denied.type).toBe('error');
    expect(denied.code).toBe('FORBIDDEN');

    ws.close();
    forbiddenJoin.close();
  });

  it('relays awareness to the room and leave on disconnect', async () => {
    if (!dbReady) {
      return;
    }

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase5c-owner-${stamp}@example.com`, password });
    expect(owner.status).toBe(201);
    const ownerToken = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;

    const page = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Presence' });
    expect(page.status).toBe(201);
    const pageId = page.body.data.page.id as string;

    const open = async () => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/sync`);
      await new Promise<void>((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      });
      socket.send(JSON.stringify({ type: 'auth', token: ownerToken }));
      expect((await waitJson(socket)).type).toBe('ready');
      socket.send(JSON.stringify({ type: 'join', workspaceId, docId: pageId, clock: 0 }));
      expect((await waitJson(socket)).type).toBe('init');
      return socket;
    };

    const first = await open();
    const second = await open();
    const pendingAwareness = waitForType(second, 'awareness');
    first.send(
      JSON.stringify({
        type: 'awareness',
        docId: pageId,
        clientId: 42,
        update: Buffer.from('aw').toString('base64'),
      })
    );
    const relayed = await pendingAwareness;
    expect(relayed.clientId).toBe(42);
    expect(relayed.update).toBe(Buffer.from('aw').toString('base64'));

    const pendingLeave = waitForType(second, 'awareness-leave');
    first.close();
    const left = await pendingLeave;
    expect(left.clientId).toBe(42);
    second.close();
  });
});
