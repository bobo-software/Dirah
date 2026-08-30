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
import { generateDocKey, isEncryptedEnvelope, openBytes, sealBytes } from '../crypto/docEnvelope';

const stamp = Date.now();
const ownerEmail = `e2e-owner-${stamp}@example.com`;
const viewerEmail = `e2e-viewer-${stamp}@example.com`;
const strangerEmail = `e2e-stranger-${stamp}@example.com`;
const password = 'password12';
const SECRET = 'e2eplaintextzymurgy';

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

describe('e2e encryption API', () => {
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
      console.warn('Skipping e2e API tests: database unavailable', error);
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

  it('stores sealed updates, refuses share and history save, stranger is 403', async () => {
    if (!dbReady) {
      return;
    }

    const owner = await request(app).post('/api/auth/register').send({ email: ownerEmail, password });
    expect(owner.status).toBe(201);
    const ownerToken = owner.body.data.tokens.accessToken as string;
    const ownerId = owner.body.data.user.id as string;
    const workspaceId = owner.body.data.workspace.id as string;
    expect(owner.body.data.workspace.encrypted).toBe(false);

    const viewer = await request(app).post('/api/auth/register').send({ email: viewerEmail, password });
    const viewerToken = viewer.body.data.tokens.accessToken as string;
    await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: viewerEmail, role: 'viewer' });

    const stranger = await request(app)
      .post('/api/auth/register')
      .send({ email: strangerEmail, password });
    const strangerToken = stranger.body.data.tokens.accessToken as string;

    const page = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Secret' });
    expect(page.status).toBe(201);
    const pageId = page.body.data.page.id as string;

    const bundle = {
      publicKey: JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b' }),
      wrappedPrivateKey: 'dGVzdA==',
      kdfSalt: 'c2FsdA==',
      kdfIterations: 210000,
    };
    expect(
      (await request(app).put('/api/auth/crypto').set('Authorization', `Bearer ${ownerToken}`).send(bundle))
        .status
    ).toBe(200);

    expect(
      (
        await request(app)
          .put(`/api/workspaces/${workspaceId}/crypto/keys`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ userId: ownerId, wrappedDek: 'wrapped-dek-owner' })
      ).status
    ).toBe(200);

    const viewerEnable = await request(app)
      .post(`/api/workspaces/${workspaceId}/crypto/enable`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerEnable.status).toBe(403);

    const enabled = await request(app)
      .post(`/api/workspaces/${workspaceId}/crypto/enable`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(enabled.status).toBe(200);

    const wsView = await request(app)
      .get(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(wsView.body.data.workspace.encrypted).toBe(true);

    const key = await generateDocKey();
    const plain = new TextEncoder().encode(SECRET);
    const sealed = await sealBytes(key, plain);

    const sock = new WebSocket(`ws://127.0.0.1:${port}/sync`);
    await new Promise<void>((resolve, reject) => {
      sock.once('open', resolve);
      sock.once('error', reject);
    });
    sock.send(JSON.stringify({ type: 'auth', token: ownerToken }));
    expect((await waitJson(sock)).type).toBe('ready');
    sock.send(JSON.stringify({ type: 'join', workspaceId, docId: pageId, clock: 0 }));
    expect((await waitJson(sock)).type).toBe('init');
    sock.send(
      JSON.stringify({
        type: 'push',
        docId: pageId,
        update: Buffer.from(sealed).toString('base64'),
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    sock.close();

    const catchup = await request(app)
      .get(`/api/pages/${pageId}/updates`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(catchup.status).toBe(200);
    const stored = Buffer.from(catchup.body.data.updates[0].update as string, 'base64');
    expect(isEncryptedEnvelope(stored)).toBe(true);
    expect(stored.toString('utf8').includes(SECRET)).toBe(false);
    expect(Buffer.from(await openBytes(key, stored))).toEqual(Buffer.from(plain));

    const forbidden = await request(app)
      .get(`/api/pages/${pageId}/updates`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(forbidden.status).toBe(403);

    const share = await request(app)
      .post(`/api/pages/${pageId}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permission: 'view' });
    expect(share.status).toBe(409);

    const history = await request(app)
      .post(`/api/pages/${pageId}/snapshots`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(history.status).toBe(409);
  });
});
