import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { WebSocket } from 'ws';
import type { Express } from 'express';
import { createApp, getDocSync } from '../app';
import { attachDocSync } from '../sync/attachDocSync';
import { createMemoryHub } from '../sync/syncBus';
import { pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { db } from '../db';
import * as Y from 'yjs';

const stamp = Date.now();
const ownerEmail = `phase5k-owner-${stamp}@example.com`;
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

async function start(
  app: Express,
  bus: ReturnType<ReturnType<typeof createMemoryHub>['connect']>
): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(app);
  attachDocSync(server, getDocSync(app), { bus });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  return { server, port: (server.address() as AddressInfo).port };
}

async function openJoined(
  port: number,
  token: string,
  workspaceId: string,
  pageId: string
): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/sync`);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  socket.send(JSON.stringify({ type: 'auth', token }));
  expect((await waitJson(socket)).type).toBe('ready');
  socket.send(JSON.stringify({ type: 'join', workspaceId, docId: pageId, clock: 0 }));
  expect((await waitJson(socket)).type).toBe('init');
  return socket;
}

describe('sync bus across two API processes', () => {
  let dbReady = false;
  let app: Express;
  let serverA: http.Server;
  let serverB: http.Server;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping sync bus API tests: database unavailable', error);
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
    const hub = createMemoryHub();
    const a = await start(app, hub.connect());
    const b = await start(app, hub.connect());
    serverA = a.server;
    serverB = b.server;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => serverA.close(() => resolve()));
    await new Promise<void>((resolve) => serverB.close(() => resolve()));
  });

  it('relays a push from a socket on process A to a socket on process B', async () => {
    if (!dbReady) {
      return;
    }

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: ownerEmail, password });
    expect(owner.status).toBe(201);
    const ownerToken = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;

    const page = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Cluster' });
    expect(page.status).toBe(201);
    const pageId = page.body.data.page.id as string;

    const portA = (serverA.address() as AddressInfo).port;
    const portB = (serverB.address() as AddressInfo).port;
    const socketA = await openJoined(portA, ownerToken, workspaceId, pageId);
    const socketB = await openJoined(portB, ownerToken, workspaceId, pageId);

    const ydoc = new Y.Doc();
    ydoc.getMap('dira').set('cluster', 'zymurgybus');
    const payload = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64');
    const pending = waitForType(socketB, 'update');
    socketA.send(JSON.stringify({ type: 'push', docId: pageId, update: payload }));
    const relayed = await pending;
    expect(relayed.update).toBe(payload);

    socketA.close();
    socketB.close();
  });
});
