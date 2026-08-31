import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool, db } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { AuthService } from '../services/AuthService';
import { PageService } from '../services/PageService';
import { AiService } from '../services/AiService';

const stamp = Date.now();
const ownerEmail = `phase5d-owner-${stamp}@example.com`;
const otherEmail = `phase5d-other-${stamp}@example.com`;
const password = 'password12';

describe('AI copilot API', () => {
  let app: Express;
  let appWithAi: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping AI API tests: database unavailable', error);
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp({
      aiService: new AiService(new PageService(db, new AuthService(db))),
    });
    appWithAi = await createApp({
      aiService: new AiService(new PageService(db, new AuthService(db)), {
        complete: async ({ prompt, context }) => `echo:${prompt}:${context.slice(0, 12)}`,
      }),
    });
  });

  it('GET /api/ai/status without a token is 401', async () => {
    const res = await request(app).get('/api/ai/status');
    expect(res.status).toBe(401);
  });

  it('Ask is off without a key; mock provider replies; stranger is 403', async () => {
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
      .send({ title: 'Notes' });
    expect(page.status).toBe(201);
    const pageId = page.body.data.page.id as string;

    const status = await request(app)
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(status.status).toBe(200);
    expect(status.body.data.enabled).toBe(false);

    const off = await request(app)
      .post(`/api/ai/pages/${pageId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ prompt: 'Summarize', context: 'Hello page' });
    expect(off.status).toBe(503);
    expect(off.body.error).toBe('AI_UNAVAILABLE');

    const enabled = await request(appWithAi)
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(enabled.body.data.enabled).toBe(true);

    const asked = await request(appWithAi)
      .post(`/api/ai/pages/${pageId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ prompt: 'Summarize', context: 'Hello page body' });
    expect(asked.status).toBe(200);
    expect(asked.body.data.reply).toBe('echo:Summarize:Hello page b');

    const emptyMd = await request(appWithAi)
      .get(`/api/pages/${pageId}/markdown`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(emptyMd.status).toBe(200);
    await request(appWithAi)
      .put(`/api/pages/${pageId}/markdown`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ content: 'Filled from stored markdown body.', hash: emptyMd.body.data.hash });
    const fromBody = await request(appWithAi)
      .post(`/api/ai/pages/${pageId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ prompt: 'Summarize', context: '' });
    expect(fromBody.status).toBe(200);
    expect(fromBody.body.data.reply).toBe('echo:Summarize:Filled from');

    const stranger = await request(appWithAi)
      .post(`/api/ai/pages/${pageId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ prompt: 'Summarize', context: 'Hello' });
    expect(stranger.status).toBe(403);

    const invited = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: otherEmail, role: 'viewer' });
    expect(invited.status).toBe(201);

    const viewerAsk = await request(appWithAi)
      .post(`/api/ai/pages/${pageId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ prompt: 'What is this?', context: 'A note' });
    expect(viewerAsk.status).toBe(200);
    expect(viewerAsk.body.data.reply).toContain('What is this?');
  });
});
