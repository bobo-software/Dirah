import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import sharp from 'sharp';
import { createApp } from '../app';
import { db, pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';

const stamp = Date.now();
const password = 'password12';

function hasFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** A 2-second 160x90 test pattern clip with a tone, made with ffmpeg. */
function makeClip(): Buffer {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dirah-asset-test-'));
  const out = path.join(dir, 'clip.mp4');
  execFileSync('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=12:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-shortest', '-pix_fmt', 'yuv420p', out,
  ]);
  const body = fs.readFileSync(out);
  fs.rmSync(dir, { recursive: true, force: true });
  return body;
}

function hasBlender(): boolean {
  try {
    execFileSync('blender', ['--version'], { stdio: 'ignore', timeout: 60_000 });
    return true;
  } catch {
    return false;
  }
}

/** Runs a Blender Python snippet in the background (a clean factory scene). */
function blenderPy(code: string): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dirah-blender-test-'));
  const script = path.join(dir, 'make.py');
  fs.writeFileSync(script, code);
  execFileSync('blender', ['-b', '--factory-startup', '-P', script], { stdio: 'ignore', timeout: 120_000 });
  fs.rmSync(dir, { recursive: true, force: true });
}

function parseMcpBody(body: unknown): Record<string, unknown> {
  if (typeof body === 'object' && body !== null) return body as Record<string, unknown>;
  const text = String(body);
  const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
  return JSON.parse(dataLine ? dataLine.slice(6) : text) as Record<string, unknown>;
}

describe('media assets API', () => {
  let app: Express;
  let dbReady = false;
  let token: string;
  let workspaceId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      if (process.env.ALLOW_DB_SKIP !== '1') throw error;
    }
    app = await createApp();
    if (!dbReady) return;
    const res = await request(app).post('/api/auth/register').send({ email: `assets-${stamp}@example.com`, password });
    token = res.body.data.tokens.accessToken;
    workspaceId = res.body.data.workspace.id;
  });

  async function waitReady(id: string, attempts = 100) {
    for (let i = 0; i < attempts; i += 1) {
      const res = await request(app).get(`/api/assets/${id}`).set(auth());
      if (res.body.data.asset.status !== 'processing') return res.body.data.asset;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('asset never finished processing');
  }

  async function upload(body: Buffer, query: string) {
    return request(app)
      .post(`/api/workspaces/${workspaceId}/assets?${query}`)
      .set(auth())
      .set('Content-Type', 'application/octet-stream')
      .send(body);
  }

  it('uploads an image into a folder, makes previews, and serves a signed link with ranges', async () => {
    if (!dbReady) return;
    const folder = await request(app)
      .post(`/api/workspaces/${workspaceId}/pages`)
      .set(auth())
      .send({ title: 'Refs', kind: 'folder' });
    const png = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#ff3366' } }).png().toBuffer();

    const created = await upload(png, `parentId=${folder.body.data.page.id}&filename=Hero%20Shot.png&role=character&tags=hero,Night`);
    expect(created.status).toBe(201);
    const asset = created.body.data.asset;
    expect(asset).toMatchObject({ title: 'Hero Shot', slug: 'hero-shot.png', mediaType: 'image', role: 'character', tags: ['hero', 'night'] });

    const ready = await waitReady(asset.id);
    expect(ready).toMatchObject({ status: 'ready', width: 2400, height: 1200 });
    expect(ready.thumbnailBlobId).toBeTruthy();
    expect(ready.previewBlobId).toBeTruthy();

    // Signed link: works without a login, supports ranges, and refuses tampering.
    const link = new URL(ready.links.url.url);
    const ranged = await request(app).get(`${link.pathname}${link.search}`).set('Range', 'bytes=0-7');
    expect(ranged.status).toBe(206);
    expect(ranged.headers['content-range']).toBe(`bytes 0-7/${png.length}`);
    const forged = await request(app).get(`${link.pathname}${link.search.replace(/sig=./, 'sig=x')}`);
    expect(forged.status).toBe(403);

    // A second upload with the same name gets its own slug.
    const again = await upload(png, `parentId=${folder.body.data.page.id}&filename=Hero%20Shot.png`);
    expect(again.body.data.asset.slug).toBe('hero-shot-2.png');
  });

  it('refuses files that are not media and generic page creation of assets', async () => {
    if (!dbReady) return;
    const pdf = await upload(Buffer.from('%PDF-1.7 not media'), 'filename=doc.pdf');
    expect(pdf.status).toBe(415);
    const direct = await request(app).post(`/api/workspaces/${workspaceId}/pages`).set(auth()).send({ kind: 'asset' });
    expect(direct.status).toBe(400);
  });

  it('edits metadata, finds the asset by description and tag, and cleans up on purge', async () => {
    if (!dbReady) return;
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#003366' } }).png().toBuffer();
    const created = await upload(png, 'filename=alley.png');
    const id = created.body.data.asset.id;
    await waitReady(id);

    const patched = await request(app)
      .patch(`/api/assets/${id}`)
      .set(auth())
      .send({ description: 'Rainy cyberpunk alley at night', tags: ['Neon Street'], role: 'location' });
    expect(patched.status).toBe(200);
    expect(patched.body.data.asset.tags).toEqual(['neon-street']);

    const byText = await request(app).get(`/api/workspaces/${workspaceId}/assets?q=cyberpunk`).set(auth());
    expect(byText.body.data.assets.map((a: { id: string }) => a.id)).toContain(id);
    const byTag = await request(app).get(`/api/workspaces/${workspaceId}/assets?tags=neon-street&role=location`).set(auth());
    expect(byTag.body.data.assets.map((a: { id: string }) => a.id)).toEqual([id]);

    const signed = new URL(patched.body.data.asset.links.url.url);
    expect((await request(app).delete(`/api/blobs/${patched.body.data.asset.blobId}`).set(auth())).status).toBe(409);
    await request(app).delete(`/api/pages/${id}`).set(auth());
    // Trashed assets stop serving signed links.
    expect((await request(app).get(`${signed.pathname}${signed.search}`)).status).toBe(404);
    const purged = await request(app).delete(`/api/pages/${id}/permanent`).set(auth());
    expect([200, 204]).toContain(purged.status);
    const blob = await pool.query('SELECT 1 FROM blobs WHERE id = $1', [patched.body.data.asset.blobId]);
    expect(blob.rowCount).toBe(0);
  });

  it.skipIf(!hasFfmpeg())('probes a video and makes a contact sheet that get_asset returns over MCP', async () => {
    if (!dbReady) return;
    const created = await upload(makeClip(), 'filename=test-pattern.mp4&role=motion');
    expect(created.status).toBe(201);
    const ready = await waitReady(created.body.data.asset.id);
    expect(ready).toMatchObject({ status: 'ready', mediaType: 'video', width: 160, height: 90, hasAudio: true });
    expect(ready.durationMs).toBeGreaterThan(1500);

    const tokenRes = await request(app).post('/api/mcp/tokens').set(auth()).send({ name: 'video-agent' });
    const secret = tokenRes.body.data.token.secret as string;
    await request(app)
      .put(`/api/mcp/tokens/${tokenRes.body.data.token.id}/access`)
      .set(auth())
      .send({ workspaces: [{ workspaceId, canWrite: true }] });
    const mcp = (name: string, args: Record<string, unknown>) =>
      request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .set('Authorization', `Bearer ${secret}`)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });

    const found = parseMcpBody((await mcp('search_assets', { mediaType: 'video', role: 'motion' })).text);
    const foundData = JSON.parse((found.result as { content: Array<{ text: string }> }).content[0].text).data;
    expect(foundData.assets[0].path).toBe('test-pattern.mp4');

    const got = parseMcpBody((await mcp('get_asset', { path: 'test-pattern.mp4' })).text);
    const content = (got.result as { content: Array<{ type: string; text?: string; mimeType?: string }> }).content;
    const data = JSON.parse(content[0].text!).data;
    expect(data.preview.kind).toBe('contact_sheet');
    expect(data.preview.frameTimesMs).toHaveLength(9);
    expect(data.url).toContain('/api/media/');
    expect(content[1]).toMatchObject({ type: 'image', mimeType: 'image/jpeg' });

    const listed = parseMcpBody((await mcp('get_asset_urls', { assets: [{ path: 'test-pattern.mp4' }], ttlSeconds: 600 })).text);
    const urls = JSON.parse((listed.result as { content: Array<{ text: string }> }).content[0].text).data.assets;
    expect(urls[0]).toMatchObject({ role: 'motion', mediaType: 'video' });

    const readFile = parseMcpBody((await mcp('read_file', { path: 'test-pattern.mp4' })).text);
    expect((readFile.result as { content: Array<{ text: string }> }).content[0].text).toContain('IS_ASSET');
  });
  describe('MCP uploads and 3D models', () => {
    let secret: string;
    const mcpCall = (name: string, args: Record<string, unknown>) =>
      request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .set('Authorization', `Bearer ${secret}`)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    const toolData = async (name: string, args: Record<string, unknown>) => {
      const body = parseMcpBody((await mcpCall(name, args)).text);
      const result = body.result as { content: Array<{ type: string; text?: string; mimeType?: string }>; isError?: boolean };
      return { payload: JSON.parse(result.content[0].text!), content: result.content };
    };

    beforeAll(async () => {
      if (!dbReady) return;
      const tokenRes = await request(app).post('/api/mcp/tokens').set(auth()).send({ name: 'upload-agent' });
      secret = tokenRes.body.data.token.secret;
      await request(app)
        .put(`/api/mcp/tokens/${tokenRes.body.data.token.id}/access`)
        .set(auth())
        .send({ workspaces: [{ workspaceId, canWrite: true }] });
    });

    it('upload_asset stores an inline base64 file into a new folder', async () => {
      if (!dbReady) return;
      const png = await sharp({ create: { width: 320, height: 200, channels: 3, background: '#33aa66' } }).png().toBuffer();
      const { payload } = await toolData('upload_asset', {
        filename: 'Green Card.png',
        data: png.toString('base64'),
        folder: 'uploads/inline',
        role: 'style',
        tags: ['inline'],
      });
      expect(payload.success).toBe(true);
      expect(payload.data).toMatchObject({ path: 'uploads/inline/green-card.png', mediaType: 'image', role: 'style' });
      const ready = await waitReady(payload.data.id);
      expect(ready).toMatchObject({ status: 'ready', width: 320, height: 200 });
    });

    it('upload_asset refuses payloads over the inline limit', async () => {
      if (!dbReady) return;
      const big = Buffer.alloc(11 * 1024 * 1024, 1).toString('base64');
      const { payload } = await toolData('upload_asset', { filename: 'big.png', data: big });
      expect(payload).toMatchObject({ success: false, error: 'INLINE_TOO_LARGE' });
    });

    it('create_asset_upload gives a single-use link that streams a raw file', async () => {
      if (!dbReady) return;
      const { payload } = await toolData('create_asset_upload', { filename: 'raw.png', folder: 'uploads/big', tags: ['link'] });
      expect(payload.data.method).toBe('PUT');
      const link = new URL(payload.data.uploadUrl);
      const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#aa3366' } }).png().toBuffer();
      const put = await request(app).put(link.pathname).set('Content-Type', 'application/octet-stream').send(png);
      expect(put.status).toBe(201);
      expect(put.body.data.asset).toMatchObject({ path: 'uploads/big/raw.png', tags: ['link'] });
      const again = await request(app).put(link.pathname).set('Content-Type', 'application/octet-stream').send(png);
      expect(again.status).toBe(410);
      const forged = await request(app).put(link.pathname.replace(/.$/, 'A')).send(png);
      expect(forged.status).toBe(403);
    });

    it.skipIf(!hasBlender())('renders a turnaround for an uploaded GLB and reports its geometry', async () => {
      if (!dbReady) return;
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dirah-glb-'));
      const glb = path.join(dir, 'crate.glb');
      blenderPy(`import bpy
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.5))
bpy.ops.export_scene.gltf(filepath=${JSON.stringify(glb)}, export_format='GLB')
`);
      const { payload } = await toolData('upload_asset', {
        filename: 'crate.glb',
        data: fs.readFileSync(glb).toString('base64'),
        folder: 'uploads/models',
        role: 'prop',
      });
      fs.rmSync(dir, { recursive: true, force: true });
      expect(payload.data.mediaType).toBe('model');
      const ready = await waitReady(payload.data.id, 1200);
      expect(ready).toMatchObject({ status: 'ready', mediaType: 'model', triangleCount: 12 });
      expect(ready.bbox.z).toBeCloseTo(1, 2);

      const got = await toolData('get_asset', { path: 'uploads/models/crate.glb' });
      expect(got.payload.data.preview.kind).toBe('turnaround');
      expect(got.payload.data.turnaroundUrl).toContain('/api/media/');
      expect(got.content[1]).toMatchObject({ type: 'image', mimeType: 'image/jpeg' });
      const urls = await toolData('get_asset_urls', { assets: [{ path: 'uploads/models/crate.glb' }] });
      expect(new URL(urls.payload.data.assets[0].referenceUrl).pathname).toBe(new URL(got.payload.data.turnaroundUrl).pathname);
    }, 180_000);

    it.skipIf(!hasBlender())('never runs Python embedded in an uploaded .blend', async () => {
      if (!dbReady) return;
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dirah-blend-'));
      const blend = path.join(dir, 'trap.blend');
      const marker = path.join(dir, 'PWNED');
      blenderPy(`import bpy
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
bpy.ops.mesh.primitive_monkey_add()
t = bpy.data.texts.new('autorun.py')
t.write("open('${marker}', 'w').write('ran')\\n")
t.use_module = True
bpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(blend)})
`);
      const { payload } = await toolData('upload_asset', {
        filename: 'trap.blend',
        data: fs.readFileSync(blend).toString('base64'),
        folder: 'uploads/models',
      });
      const ready = await waitReady(payload.data.id, 1200);
      expect(ready.status).toBe('ready');
      expect(ready.triangleCount).toBeGreaterThan(900);
      expect(fs.existsSync(marker)).toBe(false);
      fs.rmSync(dir, { recursive: true, force: true });
    }, 180_000);
  });
});
