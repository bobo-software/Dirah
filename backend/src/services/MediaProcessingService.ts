import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { assets } from '../db/schemas';
import type { Database } from './AuthService';
import type { BlobService } from './BlobService';

/** Long side of the small grid/tree thumbnail. */
export const THUMBNAIL_PX = 512;
/** Long side of the image an agent is shown; large enough to read detail, small enough to send inline. */
export const AGENT_PREVIEW_PX = 1568;
/** Frames in a video contact sheet (a square grid). */
export const CONTACT_SHEET_FRAMES = 9;
const CONTACT_SHEET_COLUMNS = 3;
const CONTACT_FRAME_WIDTH = 512;

export interface MediaToolPaths {
  ffmpeg: string;
  ffprobe: string;
}

interface ProbeResult {
  durationMs: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

interface ProcessedMedia {
  mediaType?: 'image' | 'video' | 'audio';
  mime?: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  fps?: number | null;
  hasAudio?: boolean | null;
  thumbnail?: Buffer;
  thumbnailMime?: string;
  preview?: Buffer;
  previewMime?: string;
}

/** Contact sheet frame times for a clip, in ms: the middle of each of N equal slices. */
export function contactSheetTimesMs(durationMs: number, frames = CONTACT_SHEET_FRAMES): number[] {
  if (!(durationMs > 0)) return [0];
  return Array.from({ length: frames }, (_, i) => Math.round(((i + 0.5) / frames) * durationMs));
}

function run(cmd: string, args: string[], timeoutMs = 120_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      err = (err + chunk.toString()).slice(-2000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${path.basename(cmd)} exited with ${code}: ${err.trim().split('\n').pop() ?? ''}`));
    });
  });
}

function parseFps(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const [num, den] = raw.split('/').map(Number);
  if (!num || !den) return null;
  const fps = num / den;
  return Number.isFinite(fps) && fps > 0 && fps < 1000 ? Math.round(fps * 100) / 100 : null;
}

/**
 * Makes thumbnails and agent previews for media assets and fills in their
 * dimensions and duration. Jobs run in-process with limited concurrency; an
 * asset left 'processing' by a restart is picked up again by resumePending().
 */
export class MediaProcessingService {
  private readonly queue: string[] = [];
  private readonly queued = new Set<string>();
  private active = 0;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly database: Database,
    private readonly blobs: BlobService,
    private readonly tools: MediaToolPaths,
    private readonly concurrency = 2
  ) {}

  enqueue(pageId: string): void {
    if (this.queued.has(pageId)) return;
    this.queued.add(pageId);
    this.queue.push(pageId);
    this.pump();
  }

  async resumePending(): Promise<void> {
    const rows = await this.database
      .select({ pageId: assets.pageId })
      .from(assets)
      .where(eq(assets.status, 'processing'));
    for (const row of rows) this.enqueue(row.pageId);
  }

  /** Resolves when no job is queued or running. For tests. */
  idle(): Promise<void> {
    if (this.active === 0 && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const pageId = this.queue.shift()!;
      this.active += 1;
      void this.process(pageId)
        .catch((error) => console.error('[media] processing failed', pageId, error))
        .finally(() => {
          this.active -= 1;
          this.queued.delete(pageId);
          this.pump();
          if (this.active === 0 && this.queue.length === 0) {
            const waiters = this.idleWaiters;
            this.idleWaiters = [];
            waiters.forEach((resolve) => resolve());
          }
        });
    }
  }

  async process(pageId: string): Promise<void> {
    const [asset] = await this.database.select().from(assets).where(eq(assets.pageId, pageId)).limit(1);
    if (!asset) return;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dirah-media-'));
    try {
      const info = await this.blobs.infoUnchecked(asset.blobId);
      const file = path.join(dir, `source.${asset.ext}`);
      await pipeline(await this.blobs.openStream(info), createWriteStream(file));

      const result =
        asset.mediaType === 'image'
          ? await this.processImage(file, dir)
          : await this.processAv(file, dir, asset.mediaType === 'video');

      // Storage keys start with a user id; derived files of an asset whose uploader left go under 'system'.
      const owner = asset.createdBy ?? 'system';
      const [thumb, preview] = await Promise.all([
        result.thumbnail
          ? this.blobs.storeDerived(owner, asset.workspaceId, result.thumbnail, result.thumbnailMime ?? 'image/webp')
          : null,
        result.preview
          ? this.blobs.storeDerived(owner, asset.workspaceId, result.preview, result.previewMime ?? 'image/jpeg')
          : null,
      ]);
      const oldDerived = [asset.thumbnailBlobId, asset.previewBlobId].filter((id): id is string => Boolean(id));
      await this.database
        .update(assets)
        .set({
          mediaType: result.mediaType ?? asset.mediaType,
          mime: result.mime ?? asset.mime,
          width: result.width ?? null,
          height: result.height ?? null,
          durationMs: result.durationMs ?? null,
          fps: result.fps ?? null,
          hasAudio: result.hasAudio ?? null,
          thumbnailBlobId: thumb?.id ?? null,
          previewBlobId: preview?.id ?? null,
          status: 'ready',
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(assets.pageId, pageId));
      if (oldDerived.length) await this.blobs.removeUnchecked(oldDerived);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.database
        .update(assets)
        .set({ status: 'failed', error: message.slice(0, 500), updatedAt: new Date() })
        .where(eq(assets.pageId, pageId));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  private async processImage(file: string, dir: string): Promise<ProcessedMedia> {
    let input = file;
    let meta: sharp.Metadata;
    try {
      meta = await sharp(input).metadata();
    } catch {
      // HEIC and other types this sharp build cannot decode: let ffmpeg turn the first frame into PNG.
      input = path.join(dir, 'decoded.png');
      await run(this.tools.ffmpeg, ['-v', 'error', '-y', '-i', file, '-frames:v', '1', input]);
      meta = await sharp(input).metadata();
    }
    const rotated = (meta.orientation ?? 1) >= 5;
    const width = (rotated ? meta.height : meta.width) ?? null;
    const height = (rotated ? meta.width : meta.height) ?? null;
    const [thumbnail, preview] = await Promise.all([
      sharp(input).rotate().resize(THUMBNAIL_PX, THUMBNAIL_PX, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
      sharp(input)
        .rotate()
        .resize(AGENT_PREVIEW_PX, AGENT_PREVIEW_PX, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 85 })
        .toBuffer(),
    ]);
    return { width, height, thumbnail, thumbnailMime: 'image/webp', preview, previewMime: 'image/jpeg' };
  }

  private async probe(file: string): Promise<ProbeResult> {
    const raw = await run(this.tools.ffprobe, [
      '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file,
    ]);
    const parsed = JSON.parse(raw.toString()) as {
      streams?: Array<Record<string, unknown>>;
      format?: { duration?: string };
    };
    const streams = parsed.streams ?? [];
    const video = streams.find(
      (s) => s.codec_type === 'video' && !(s.disposition as Record<string, number> | undefined)?.attached_pic
    );
    const audio = streams.find((s) => s.codec_type === 'audio');
    const seconds = Number(parsed.format?.duration ?? video?.duration ?? audio?.duration);
    let width = typeof video?.width === 'number' ? video.width : null;
    let height = typeof video?.height === 'number' ? video.height : null;
    const sideData = (video?.side_data_list as Array<{ rotation?: number }> | undefined) ?? [];
    const rotation = Math.abs(sideData.find((d) => typeof d.rotation === 'number')?.rotation ?? 0);
    if (rotation === 90 || rotation === 270) [width, height] = [height, width];
    return {
      durationMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null,
      width,
      height,
      fps: parseFps(video?.avg_frame_rate) ?? parseFps(video?.r_frame_rate),
      hasVideo: Boolean(video),
      hasAudio: Boolean(audio),
    };
  }

  private async frameAt(file: string, dir: string, ms: number, name: string): Promise<Buffer> {
    const out = path.join(dir, name);
    await run(this.tools.ffmpeg, [
      '-v', 'error', '-y', '-ss', (ms / 1000).toFixed(3), '-i', file,
      '-frames:v', '1', '-vf', `scale=${CONTACT_FRAME_WIDTH}:-2`, out,
    ]);
    return fs.readFile(out);
  }

  private async processAv(file: string, dir: string, expectVideo: boolean): Promise<ProcessedMedia> {
    const probe = await this.probe(file);
    if (!probe.hasVideo && !probe.hasAudio) throw new Error('No audio or video stream found');

    if (probe.hasVideo) {
      const duration = probe.durationMs ?? 0;
      const times = contactSheetTimesMs(duration);
      const frames: Buffer[] = [];
      for (const [i, ms] of times.entries()) {
        try {
          frames.push(await this.frameAt(file, dir, ms, `frame-${i}.png`));
        } catch {
          // Seeking past the last keyframe of a short clip can fail; skip that frame.
        }
      }
      if (!frames.length) frames.push(await this.frameAt(file, dir, 0, 'frame-first.png'));
      const poster = frames[Math.min(frames.length - 1, Math.floor(frames.length / 3))];
      const thumbnail = await sharp(poster)
        .resize(THUMBNAIL_PX, THUMBNAIL_PX, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      return {
        width: probe.width,
        height: probe.height,
        durationMs: probe.durationMs,
        fps: probe.fps,
        hasAudio: probe.hasAudio,
        thumbnail,
        thumbnailMime: 'image/webp',
        preview: await this.contactSheet(frames),
        previewMime: 'image/jpeg',
      };
    }

    // Audio, or a container sniffed as video that only holds audio.
    const wave = path.join(dir, 'wave.png');
    await run(this.tools.ffmpeg, [
      '-v', 'error', '-y', '-i', file,
      '-filter_complex', 'aformat=channel_layouts=mono,showwavespic=s=1200x240:colors=0x6366f1',
      '-frames:v', '1', wave,
    ]);
    const waveBuf = await fs.readFile(wave);
    const thumbnail = await sharp(waveBuf)
      .resize(THUMBNAIL_PX, THUMBNAIL_PX, { fit: 'inside' })
      .flatten({ background: '#ffffff' })
      .webp({ quality: 80 })
      .toBuffer();
    const preview = await sharp(waveBuf).flatten({ background: '#ffffff' }).png().toBuffer();
    return {
      ...(expectVideo ? { mediaType: 'audio' as const, mime: 'audio/webm' } : {}),
      durationMs: probe.durationMs,
      hasAudio: true,
      thumbnail,
      thumbnailMime: 'image/webp',
      preview,
      previewMime: 'image/png',
    };
  }

  /** Lays frames out in a 3-column grid, left to right then top to bottom, in time order. */
  private async contactSheet(frames: Buffer[]): Promise<Buffer> {
    const metas = await Promise.all(frames.map((frame) => sharp(frame).metadata()));
    const cellW = CONTACT_FRAME_WIDTH;
    const cellH = Math.max(...metas.map((m) => Math.round(((m.height ?? 288) / (m.width ?? cellW)) * cellW)));
    const columns = Math.min(CONTACT_SHEET_COLUMNS, frames.length);
    const rows = Math.ceil(frames.length / columns);
    const gap = 4;
    const composite = await Promise.all(
      frames.map(async (frame, i) => ({
        input: await sharp(frame).resize(cellW, cellH, { fit: 'contain', background: '#000000' }).png().toBuffer(),
        left: (i % columns) * (cellW + gap),
        top: Math.floor(i / columns) * (cellH + gap),
      }))
    );
    return sharp({
      create: {
        width: columns * cellW + (columns - 1) * gap,
        height: rows * cellH + (rows - 1) * gap,
        channels: 3,
        background: '#111111',
      },
    })
      .composite(composite)
      .resize(AGENT_PREVIEW_PX, AGENT_PREVIEW_PX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  }
}
