import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import * as Y from 'yjs';
import { createApp, getDocSync } from '../app';
import { pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { db } from '../db';
import { extractPlainText } from '../search/extractPlainText';

const stamp = Date.now();
const ownerEmail = `phase5j-owner-${stamp}@example.com`;
const viewerEmail = `phase5j-viewer-${stamp}@example.com`;
const password = 'password12';
const FIRST = 'snapfirstzymurgy';
const SECOND = 'snapsecondfnord';

function blockDocWithText(text: string): Buffer {
  const doc = new Y.Doc();
  const blocks = doc.getMap('blocks');
  const block = new Y.Map();
  const ytext = new Y.Text();
  ytext.insert(0, text);
  block.set('sys:flavour', 'affine:paragraph');
  block.set('prop:text', ytext);
  blocks.set('b1', block);
  return Buffer.from(Y.encodeStateAsUpdate(doc));
}

describe('page snapshot history API', () => {
  let app: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping history API tests: database unavailable', error);
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
  });

  it('saves versions, previews them, restores an older one; viewers cannot save', async () => {
    if (!dbReady) {
      return;
    }

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: ownerEmail, password });
    expect(owner.status).toBe(201);
    const ownerToken = owner.body.data.tokens.accessToken as string;
    const ownerId = owner.body.data.user.id as string;
    const workspaceId = owner.body.data.workspace.id as string;

    const viewer = await request(app)
      .post('/api/auth/register')
      .send({ email: viewerEmail, password });
    expect(viewer.status).toBe(201);
    const viewerToken = viewer.body.data.tokens.accessToken as string;
    const invited = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: viewerEmail, role: 'viewer' });
    expect(invited.status).toBe(201);

    const page = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'History page' });
    expect(page.status).toBe(201);
    const pageId = page.body.data.page.id as string;

    const emptySave = await request(app)
      .post(`/api/pages/${pageId}/snapshots`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(emptySave.status).toBe(400);

    await getDocSync(app).push(ownerId, pageId, blockDocWithText(FIRST));
    const firstSave = await request(app)
      .post(`/api/pages/${pageId}/snapshots`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(firstSave.status).toBe(201);
    expect(firstSave.body.data.snapshot.preview).toContain(FIRST);
    const firstId = firstSave.body.data.snapshot.id as number;

    await getDocSync(app).push(ownerId, pageId, blockDocWithText(SECOND));
    const secondSave = await request(app)
      .post(`/api/pages/${pageId}/snapshots`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(secondSave.status).toBe(201);
    expect(secondSave.body.data.snapshot.preview).toContain(SECOND);

    const listed = await request(app)
      .get(`/api/pages/${pageId}/snapshots`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.snapshots).toHaveLength(2);
    expect(listed.body.data.snapshots[0].preview).toContain(SECOND);

    const preview = await request(app)
      .get(`/api/pages/${pageId}/snapshots/${firstId}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.snapshot.preview).toContain(FIRST);

    const viewerSave = await request(app)
      .post(`/api/pages/${pageId}/snapshots`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerSave.status).toBe(403);

    const viewerRestore = await request(app)
      .post(`/api/pages/${pageId}/snapshots/${firstId}/restore`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerRestore.status).toBe(403);

    const restored = await request(app)
      .post(`/api/pages/${pageId}/snapshots/${firstId}/restore`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(restored.status).toBe(200);

    const catchup = await getDocSync(app).catchup(ownerId, pageId, 0);
    expect(catchup.snapshot).toBeTruthy();
    const live = new Y.Doc();
    Y.applyUpdate(live, new Uint8Array(catchup.snapshot!));
    const text = extractPlainText(Y, live);
    expect(text).toContain(FIRST);
    expect(text).not.toContain(SECOND);
  });
});
