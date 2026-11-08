import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { MediaUrlService } from './MediaUrlService';
import { sniffMedia } from '../utils/mediaType';
import { meterStream, parseRangeHeader } from '../utils/streams';
import { isPrivateAddress, safeFetch } from '../utils/safeFetch';
import { assetSearchText, normalizeTags } from './AssetService';
import { contactSheetTimesMs } from './MediaProcessingService';

function urls(now = 1_700_000_000_000) {
  return new MediaUrlService({
    publicOrigin: 'https://api.example.com/',
    secret: '',
    fallbackSecret: 'test-jwt-secret',
    defaultTtlSeconds: 3600,
    maxTtlSeconds: 86_400,
    now: () => now,
  });
}

function query(url: string) {
  const parsed = new URL(url);
  return { exp: parsed.searchParams.get('exp')!, sig: parsed.searchParams.get('sig')!, path: parsed.pathname };
}

describe('MediaUrlService', () => {
  it('signs a link that verifies for its blob until it expires', () => {
    const signed = urls().sign('blob-1');
    const { exp, sig, path } = query(signed.url);
    expect(path).toBe('/api/media/blob-1');
    expect(signed.url.startsWith('https://api.example.com/api/media/')).toBe(true);
    expect(urls().verify('blob-1', exp, sig)).toBe(3600);
    expect(urls(1_700_000_000_000 + 3_601_000).verify('blob-1', exp, sig)).toBeNull();
  });

  it('rejects a link moved to another blob, an extended expiry, or a forged signature', () => {
    const { exp, sig } = query(urls().sign('blob-1').url);
    expect(urls().verify('blob-2', exp, sig)).toBeNull();
    expect(urls().verify('blob-1', String(Number(exp) + 1000), sig)).toBeNull();
    expect(urls().verify('blob-1', exp, `${sig.slice(0, -1)}A`)).toBeNull();
    expect(urls().verify('blob-1', exp, undefined)).toBeNull();
    expect(urls().verify('../etc', exp, sig)).toBeNull();
  });

  it('clamps the lifetime between a minute and the maximum', () => {
    expect(urls().clampTtl(5)).toBe(60);
    expect(urls().clampTtl(10 ** 9)).toBe(86_400);
    expect(urls().clampTtl()).toBe(3600);
  });

  it('uses MEDIA_URL_SECRET when set, so links from another key fail', () => {
    const other = new MediaUrlService({
      publicOrigin: 'https://api.example.com',
      secret: 'a-dedicated-media-secret',
      fallbackSecret: 'test-jwt-secret',
      defaultTtlSeconds: 3600,
      maxTtlSeconds: 86_400,
      now: () => 1_700_000_000_000,
    });
    const { exp, sig } = query(other.sign('blob-1').url);
    expect(urls().verify('blob-1', exp, sig)).toBeNull();
    expect(other.verify('blob-1', exp, sig)).not.toBeNull();
  });
});

describe('sniffMedia', () => {
  const box = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from(`ftyp${brand}`), Buffer.alloc(16)]);

  it('recognises video containers', () => {
    expect(sniffMedia(box('isom'))).toEqual({ mime: 'video/mp4', mediaType: 'video', ext: 'mp4' });
    expect(sniffMedia(box('qt  '))).toEqual({ mime: 'video/quicktime', mediaType: 'video', ext: 'mov' });
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('\x9fB\x82\x84webm')]);
    expect(sniffMedia(webm)?.mime).toBe('video/webm');
  });

  it('recognises audio', () => {
    expect(sniffMedia(box('M4A '))?.mediaType).toBe('audio');
    expect(sniffMedia(Buffer.from('ID3\x04\x00\x00\x00'))?.ext).toBe('mp3');
    expect(sniffMedia(Buffer.from([0xff, 0xfb, 0x90, 0x00]))?.ext).toBe('mp3');
    expect(sniffMedia(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]))?.ext).toBe('wav');
    expect(sniffMedia(Buffer.from('OggS\x00\x02'))?.ext).toBe('ogg');
    expect(sniffMedia(Buffer.from('fLaC\x00'))?.ext).toBe('flac');
  });

  it('recognises images, including HEIC and AVIF', () => {
    expect(sniffMedia(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe('png');
    expect(sniffMedia(box('heic'))?.mime).toBe('image/heic');
    expect(sniffMedia(box('avif'))?.mime).toBe('image/avif');
  });

  it('refuses everything else', () => {
    expect(sniffMedia(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(sniffMedia(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffMedia(Buffer.from('PK\x03\x04'))).toBeNull();
    expect(sniffMedia(Buffer.alloc(0))).toBeNull();
  });
});

describe('parseRangeHeader', () => {
  it('parses open, closed and suffix ranges', () => {
    expect(parseRangeHeader('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRangeHeader('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
    expect(parseRangeHeader('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRangeHeader('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
  });

  it('flags ranges past the end and ignores ones it does not handle', () => {
    expect(parseRangeHeader('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseRangeHeader('bytes=5-2', 1000)).toBe('unsatisfiable');
    expect(parseRangeHeader('bytes=0-1,5-6', 1000)).toBeNull();
    expect(parseRangeHeader('items=0-1', 1000)).toBeNull();
    expect(parseRangeHeader(undefined, 1000)).toBeNull();
  });
});

describe('meterStream', () => {
  it('peeks the head, then passes every byte through with its hash and size', async () => {
    const source = Readable.from([Buffer.from('hello '), Buffer.from('media '), Buffer.from('world')]);
    const metered = await meterStream(source, { headBytes: 8, maxBytes: 1000 });
    expect(metered.head.toString()).toBe('hello me');
    const chunks: Buffer[] = [];
    for await (const chunk of metered.stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('hello media world');
    expect(metered.result().byteSize).toBe(17);
    expect(metered.result().contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails with 413 once the limit is passed', async () => {
    const source = Readable.from([Buffer.alloc(600), Buffer.alloc(600)]);
    const metered = await meterStream(source, { headBytes: 8, maxBytes: 1000 });
    await expect(async () => {
      for await (const _chunk of metered.stream) {
        // drain
      }
    }).rejects.toMatchObject({ status: 413, code: 'BLOB_TOO_LARGE' });
  });
});

describe('import URL guard', () => {
  it('treats loopback, private, link-local and mapped addresses as private', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '172.32.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('refuses non-https and private-literal URLs before connecting', async () => {
    await expect(safeFetch('http://example.com/a.png', { maxBytes: 10 })).rejects.toMatchObject({ code: 'INVALID_URL' });
    await expect(safeFetch('https://127.0.0.1/a.png', { maxBytes: 10 })).rejects.toMatchObject({ code: 'PRIVATE_ADDRESS' });
    await expect(safeFetch('https://[::1]/a.png', { maxBytes: 10 })).rejects.toMatchObject({ code: 'PRIVATE_ADDRESS' });
    await expect(safeFetch('https://169.254.169.254/latest', { maxBytes: 10 })).rejects.toMatchObject({ code: 'PRIVATE_ADDRESS' });
  });

  it('refuses hostnames that resolve to private addresses', async () => {
    await expect(safeFetch('https://localhost/a.png', { maxBytes: 10 })).rejects.toMatchObject({ code: 'PRIVATE_ADDRESS' });
  });
});

describe('asset helpers', () => {
  it('normalizes tags to unique lowercase slugs', () => {
    expect(normalizeTags([' Night ', 'night', 'Neon Street', ''])).toEqual(['night', 'neon-street']);
    expect(normalizeTags(undefined)).toBeUndefined();
  });

  it('indexes tags both hyphenated and as words', () => {
    const text = assetSearchText({
      title: 'Hero',
      description: 'Rain at night',
      tags: ['neon-street'],
      role: 'location',
      promptHint: 'wide shot',
      mediaType: 'image',
      generation: { prompt: 'cyberpunk alley', model: 'veo' },
    });
    expect(text).toContain('neon-street');
    expect(text).toContain('neon street');
    expect(text).toContain('cyberpunk alley');
  });

  it('spreads contact sheet frames over the clip', () => {
    expect(contactSheetTimesMs(9000)).toEqual([500, 1500, 2500, 3500, 4500, 5500, 6500, 7500, 8500]);
    expect(contactSheetTimesMs(0)).toEqual([0]);
  });
});

describe('3D model detection', () => {
  it('recognises GLB, binary FBX and .blend by their bytes', () => {
    expect(sniffMedia(Buffer.from('glTF\x02\x00\x00\x00'))).toEqual({ mime: 'model/gltf-binary', mediaType: 'model', ext: 'glb' });
    expect(sniffMedia(Buffer.from('Kaydara FBX Binary  \x00'))?.ext).toBe('fbx');
    expect(sniffMedia(Buffer.from('BLENDER-v405RENDH'))?.ext).toBe('blend');
  });

  it('uses the file name only for formats without magic bytes', () => {
    const obj = Buffer.from('# Blender OBJ\nmtllib cube.mtl\no Cube\nv 1.0 1.0 -1.0\nv 1.0 -1.0 -1.0\nvn 0 1 0\nf 1//1 2//1 3//1\n');
    expect(sniffMedia(obj, 'cube.obj')?.mime).toBe('model/obj');
    expect(sniffMedia(obj, 'cube.txt')).toBeNull();
    expect(sniffMedia(obj)).toBeNull();
    expect(sniffMedia(Buffer.from('; FBX 7.4.0 project file\n'), 'rig.fbx')?.ext).toBe('fbx');
    expect(sniffMedia(Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0, 0]), 'scene.blend')?.ext).toBe('blend');
    expect(sniffMedia(Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0, 0]), 'scene.zst')).toBeNull();
  });

  it('refuses a .obj name on binary or non-OBJ text', () => {
    expect(sniffMedia(Buffer.from([0x00, 0x01, 0x02, 0x76, 0x20]), 'evil.obj')).toBeNull();
    expect(sniffMedia(Buffer.from('<html><script>alert(1)</script>\n'), 'evil.obj')).toBeNull();
  });
});

describe('upload links', () => {
  const uploads = (now = 1_700_000_000_000) =>
    new MediaUrlService({
      publicOrigin: 'https://api.example.com',
      secret: '',
      fallbackSecret: 'test-jwt-secret',
      defaultTtlSeconds: 3600,
      maxTtlSeconds: 86_400,
      now: () => now,
    });
  const intentId = '6f1c1c1e-6a0b-4f43-9a40-6b7d2c1f0a11';
  const tokenOf = (url: string) => url.split('/api/uploads/')[1];

  it('verifies its own token until it expires', () => {
    const link = uploads().signUpload(intentId, 900);
    expect(uploads().verifyUpload(tokenOf(link.url))).toBe(intentId);
    expect(uploads(1_700_000_000_000 + 901_000).verifyUpload(tokenOf(link.url))).toBeNull();
  });

  it('cannot be forged from a media link signature or pointed at another intent', () => {
    const exp = 1_700_000_000 + 900;
    const media = new URL(uploads().sign(intentId, 900).url);
    const mediaSig = media.searchParams.get('sig')!;
    expect(uploads().verifyUpload(`${intentId}.${exp}.${mediaSig}`)).toBeNull();
    const token = tokenOf(uploads().signUpload(intentId, 900).url);
    expect(uploads().verifyUpload(token.replace(intentId, '00000000-0000-4000-8000-000000000000'))).toBeNull();
    expect(uploads().verifyUpload('../../etc/passwd')).toBeNull();
  });
});
