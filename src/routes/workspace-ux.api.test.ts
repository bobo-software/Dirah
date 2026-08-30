import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { db } from '../db';

const stamp = Date.now();
const ownerEmail = `phase4-owner-${stamp}@example.com`;
const viewerEmail = `phase4-viewer-${stamp}@example.com`;
const otherEmail = `phase4-other-${stamp}@example.com`;
const password = 'password12';

describe('workspace UX API', () => {
  let app: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping workspace UX API tests: database unavailable', error);
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
  });

  it('nests, searches, favorites, cascade-trashes, restores, and blocks cycles', async () => {
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
    const otherWorkspaceId = other.body.data.workspace.id as string;

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

    const parent = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Parent Alpha' });
    expect(parent.status).toBe(201);
    const parentId = parent.body.data.page.id as string;

    const child = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Child Beta', parentId });
    expect(child.status).toBe(201);
    expect(child.body.data.page.parentId).toBe(parentId);
    const childId = child.body.data.page.id as string;

    const listed = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listed.status).toBe(200);
    const childRow = listed.body.data.pages.find((p: { id: string }) => p.id === childId);
    expect(childRow.parentId).toBe(parentId);

    const cycle = await request(app)
      .patch(`/api/pages/${parentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parentId: childId });
    expect(cycle.status).toBe(400);
    expect(cycle.body.error).toBe('CYCLE');

    const selfCycle = await request(app)
      .patch(`/api/pages/${parentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parentId });
    expect(selfCycle.status).toBe(400);

    await request(app)
      .post(`/api/workspaces/${otherWorkspaceId}/pages`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Parent Alpha' });

    const search = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .query({ q: 'Parent Alpha' })
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(search.status).toBe(200);
    expect(search.body.data.pages).toHaveLength(1);
    expect(search.body.data.pages[0].id).toBe(parentId);

    const otherSearch = await request(app)
      .get(`/api/workspaces/${otherWorkspaceId}/pages`)
      .query({ q: 'Parent Alpha' })
      .set('Authorization', `Bearer ${otherToken}`);
    expect(otherSearch.body.data.pages).toHaveLength(1);
    expect(otherSearch.body.data.pages[0].id).not.toBe(parentId);

    const fav = await request(app)
      .put(`/api/pages/${parentId}/favorite`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(fav.status).toBe(200);
    expect(fav.body.data.page.favorited).toBe(true);

    const listedFav = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listedFav.body.data.pages.find((p: { id: string }) => p.id === parentId).favorited).toBe(
      true
    );

    const viewerFav = await request(app)
      .put(`/api/pages/${parentId}/favorite`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerFav.status).toBe(200);

    const viewerTrash = await request(app)
      .delete(`/api/pages/${parentId}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerTrash.status).toBe(403);

    const trashed = await request(app)
      .delete(`/api/pages/${parentId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(trashed.status).toBe(200);

    const live = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(live.body.data.pages).toHaveLength(0);

    const bin = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .query({ trashed: '1' })
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(bin.body.data.pages).toHaveLength(2);
    expect(bin.body.data.pages.every((p: { deletedAt: string | null }) => p.deletedAt)).toBe(true);

    const updates = await request(app)
      .get(`/api/pages/${parentId}/updates`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(updates.status).toBe(404);

    const restored = await request(app)
      .post(`/api/pages/${parentId}/restore`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(restored.status).toBe(200);
    expect(restored.body.data.page.deletedAt).toBeNull();

    const afterRestore = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(afterRestore.body.data.pages).toHaveLength(1);
    expect(afterRestore.body.data.pages[0].id).toBe(parentId);

    const childStillTrashed = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .query({ trashed: '1' })
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(childStillTrashed.body.data.pages).toHaveLength(1);
    expect(childStillTrashed.body.data.pages[0].id).toBe(childId);

    const restoredChild = await request(app)
      .post(`/api/pages/${childId}/restore`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(restoredChild.body.data.page.parentId).toBe(parentId);

    await request(app)
      .delete(`/api/pages/${parentId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const hard = await request(app)
      .delete(`/api/pages/${parentId}/permanent`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(hard.status).toBe(200);
    expect(hard.body.data.ids).toEqual(expect.arrayContaining([parentId, childId]));

    const emptyBin = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .query({ trashed: '1' })
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(emptyBin.body.data.pages).toHaveLength(0);
  });
});
