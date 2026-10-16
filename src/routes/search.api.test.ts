import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { db } from '../db';

const stamp = Date.now();
const ownerEmail = `phase5g-owner-${stamp}@example.com`;
const viewerEmail = `phase5g-viewer-${stamp}@example.com`;
const otherEmail = `phase5g-other-${stamp}@example.com`;
const password = 'password12';
const BODY_TOKEN = 'xyzzyplughfts';

describe('full-text search API', () => {
  let app: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping search API tests: database unavailable', error);
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
  });

  it('indexes markdown body text and finds it with ?q=; title search still works', async () => {
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
    const inviteToken = String(invited.body.data.invite.inviteUrl).split('/invite/')[1];
    expect(
      (await request(app).post(`/api/invites/${inviteToken}/accept`).set('Authorization', `Bearer ${viewerToken}`).send({})).status
    ).toBe(201);

    const page = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Quiet Title', kind: 'markdown' });
    expect(page.status).toBe(201);
    const pageId = page.body.data.page.id as string;

    const decoy = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Other Page', kind: 'markdown' });
    expect(decoy.status).toBe(201);

    const empty = await request(app)
      .get(`/api/pages/${pageId}/markdown`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(empty.status).toBe(200);
    const written = await request(app)
      .put(`/api/pages/${pageId}/markdown`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ content: `hello ${BODY_TOKEN} world`, hash: empty.body.data.hash });
    expect(written.status).toBe(200);

    const byBody = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .query({ q: BODY_TOKEN })
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(byBody.status).toBe(200);
    expect(byBody.body.data.pages).toHaveLength(1);
    expect(byBody.body.data.pages[0].id).toBe(pageId);

    const viewerSearch = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .query({ q: BODY_TOKEN })
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerSearch.status).toBe(200);
    expect(viewerSearch.body.data.pages).toHaveLength(1);

    const otherSearch = await request(app)
      .get(`/api/workspaces/${otherWorkspaceId}/pages`)
      .query({ q: BODY_TOKEN })
      .set('Authorization', `Bearer ${otherToken}`);
    expect(otherSearch.status).toBe(200);
    expect(otherSearch.body.data.pages).toHaveLength(0);

    const byTitle = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .query({ q: 'Quiet Title' })
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(byTitle.body.data.pages).toHaveLength(1);
    expect(byTitle.body.data.pages[0].id).toBe(pageId);
  });

  it('finds a spaced ticket heading with hyphenated ?q=', async () => {
    if (!dbReady) return;

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase5g-ticket-${stamp}@example.com`, password });
    expect(owner.status).toBe(201);
    const ownerToken = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;

    const page = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'PP - B4', kind: 'markdown' });
    expect(page.status).toBe(201);
    const pageId = page.body.data.page.id as string;

    const empty = await request(app)
      .get(`/api/pages/${pageId}/markdown`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const written = await request(app)
      .put(`/api/pages/${pageId}/markdown`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ content: '# PP - B4\n\nShipped notes.\n', hash: empty.body.data.hash });
    expect(written.status).toBe(200);

    for (const q of ['PP-B4', 'pp-b4', 'PP - B4']) {
      const found = await request(app)
        .get(`/api/workspaces/${workspaceId}/pages`)
        .query({ q })
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(found.status).toBe(200);
      expect(found.body.data.pages.some((p: { id: string }) => p.id === pageId)).toBe(true);
    }
  });
});
