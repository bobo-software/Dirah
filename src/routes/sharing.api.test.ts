import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool, db } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';

const stamp = Date.now();
const ownerEmail = `phase3-owner-${stamp}@example.com`;
const editorEmail = `phase3-editor-${stamp}@example.com`;
const viewerEmail = `phase3-viewer-${stamp}@example.com`;
const strangerEmail = `phase3-stranger-${stamp}@example.com`;
const password = 'password12';

describe('sharing API', () => {
  let app: Express;
  let dbReady = false;

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
  });

  it('members, roles, and public markdown share', async () => {
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
    const editorInviteToken = String(invitedEditor.body.data.invite.inviteUrl).split('/invite/')[1];
    expect(
      (await request(app).post(`/api/invites/${editorInviteToken}/accept`).set('Authorization', `Bearer ${editorToken}`).send({})).status
    ).toBe(201);

    const invitedViewer = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: viewerEmail, role: 'viewer' });
    expect(invitedViewer.status).toBe(201);
    const viewerInviteToken = String(invitedViewer.body.data.invite.inviteUrl).split('/invite/')[1];
    expect(
      (await request(app).post(`/api/invites/${viewerInviteToken}/accept`).set('Authorization', `Bearer ${viewerToken}`).send({})).status
    ).toBe(201);

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
      .send({ title: 'Shared', kind: 'markdown' });
    expect(page.status).toBe(201);
    expect(page.body.data.page.kind).toBe('markdown');
    const pageId = page.body.data.page.id as string;

    const empty = await request(app)
      .get(`/api/pages/${pageId}/markdown`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(empty.status).toBe(200);
    await request(app)
      .put(`/api/pages/${pageId}/markdown`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ content: '# Shared\n\nHello public.\n', hash: empty.body.data.hash });

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

    const folder = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Folder', kind: 'folder' });
    expect(folder.status).toBe(201);
    const folderShare = await request(app)
      .post(`/api/pages/${folder.body.data.page.id}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permission: 'view' });
    expect(folderShare.status).toBe(400);

    const share = await request(app)
      .post(`/api/pages/${pageId}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permission: 'view' });
    expect(share.status).toBe(201);
    const token = share.body.data.share.token as string;

    const publicPage = await request(app).get(`/api/public/pages/${token}`);
    expect(publicPage.status).toBe(200);
    expect(publicPage.body.data.page.id).toBe(pageId);
    expect(publicPage.body.data.page.kind).toBe('markdown');

    const publicMd = await request(app).get(`/api/public/pages/${token}/markdown`);
    expect(publicMd.status).toBe(200);
    expect(publicMd.body.data.content).toContain('Hello public.');

    const publicSiblings = await request(app)
      .get(`/api/workspaces/${workspaceId}/pages`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(publicSiblings.status).toBe(403);

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
  });
});
