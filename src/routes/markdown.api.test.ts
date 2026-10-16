import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { db } from '../db';

const stamp = Date.now();
const ownerEmail = `phase6-md-owner-${stamp}@example.com`;
const otherEmail = `phase6-md-other-${stamp}@example.com`;
const password = 'password12';

describe('markdown catalog API', () => {
  let app: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping markdown catalog API tests: database unavailable', error);
      // Set ALLOW_DB_SKIP=1 to run without Postgres; otherwise a missing database must fail, not pass.
      if (process.env.ALLOW_DB_SKIP !== '1') throw error;
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
  });

  it('creates folders and markdown, enforces parent/slug rules, and indexes body', async () => {
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
    expect(other.status).toBe(201);
    const otherToken = other.body.data.tokens.accessToken as string;

    const folder = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Docs', kind: 'folder' });
    expect(folder.status).toBe(201);
    expect(folder.body.data.page.kind).toBe('folder');
    expect(folder.body.data.page.slug).toBe('docs');
    const folderId = folder.body.data.page.id as string;

    const nested = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'API', kind: 'folder', parentId: folderId });
    expect(nested.status).toBe(201);
    const nestedId = nested.body.data.page.id as string;

    const md = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Auth', kind: 'markdown', parentId: nestedId });
    expect(md.status).toBe(201);
    expect(md.body.data.page.kind).toBe('markdown');
    expect(md.body.data.page.slug).toBe('auth');
    const mdId = md.body.data.page.id as string;

    const clash = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Auth!', kind: 'markdown', parentId: nestedId });
    expect(clash.status).toBe(201);
    expect(clash.body.data.page.slug).toBe('auth-2');

    const childOfMd = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Nope', kind: 'folder', parentId: mdId });
    expect(childOfMd.status).toBe(400);

    const empty = await request(app)
      .get(`/api/pages/${mdId}/markdown`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data.content).toBe('');
    const emptyHash = empty.body.data.hash as string;

    const written = await request(app)
      .put(`/api/pages/${mdId}/markdown`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ content: '# Auth\n\nUse tokens.\n```js\nhidden()\n```\nzyxxysearchtoken', hash: emptyHash });
    expect(written.status).toBe(200);
    expect(written.body.data.content).toContain('# Auth');

    const stale = await request(app)
      .put(`/api/pages/${mdId}/markdown`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ content: 'stale', hash: emptyHash });
    expect(stale.status).toBe(409);

    const found = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .query({ q: 'zyxxysearchtoken' })
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(found.status).toBe(200);
    expect(found.body.data.pages.some((page: { id: string }) => page.id === mdId)).toBe(true);

    const hiddenFence = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .query({ q: 'hidden' })
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(hiddenFence.body.data.pages.some((page: { id: string }) => page.id === mdId)).toBe(false);

    const forbidden = await request(app)
      .get(`/api/pages/${mdId}/markdown`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(forbidden.status).toBe(403);

    const trashed = await request(app)
      .delete(`/api/pages/${folderId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(trashed.status).toBe(200);
    const live = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(live.body.data.pages.some((page: { id: string }) => page.id === mdId)).toBe(false);

    const restored = await request(app)
      .post(`/api/pages/${folderId}/restore`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(restored.status).toBe(200);

    const rejectedPage = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Legacy', kind: 'page' });
    expect(rejectedPage.status).toBe(400);
  });
});
