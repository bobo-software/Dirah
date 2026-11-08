import { sniffImageMime } from './imageType';

export type MediaKind = 'image' | 'video' | 'audio';

export interface SniffedMedia {
  mime: string;
  mediaType: MediaKind;
  /** File extension, without the dot, used in the asset's path. */
  ext: string;
}

/** How many leading bytes sniffMedia needs. */
export const MEDIA_SNIFF_BYTES = 64;

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

const QUICKTIME_BRANDS = new Set(['qt  ']);
const MP4_AUDIO_BRANDS = new Set(['M4A ', 'M4B ', 'M4P ']);
const MP4_VIDEO_BRANDS = new Set([
  'isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'M4VH', 'M4VP',
  'dash', 'msnv', 'NDAS', 'f4v ', 'mmp4', '3gp4', '3gp5', '3gp6', '3g2a', 'XAVC', 'MSNV',
]);

/**
 * The media type of a file from its leading bytes, or null when it is not a
 * supported image, video or audio file. The client's content-type is never trusted.
 * Matroska/WebM is reported as video; ffprobe later reclassifies an audio-only file.
 */
export function sniffMedia(head: Buffer): SniffedMedia | null {
  const image = sniffImageMime(head);
  if (image) return { mime: image, mediaType: 'image', ext: IMAGE_EXT[image] };

  const ascii = (start: number, end: number) =>
    head.length >= end ? head.subarray(start, end).toString('latin1') : '';

  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'avif' || brand === 'avis') return { mime: 'image/avif', mediaType: 'image', ext: 'avif' };
    if (QUICKTIME_BRANDS.has(brand)) return { mime: 'video/quicktime', mediaType: 'video', ext: 'mov' };
    if (MP4_AUDIO_BRANDS.has(brand)) return { mime: 'audio/mp4', mediaType: 'audio', ext: 'm4a' };
    if (MP4_VIDEO_BRANDS.has(brand) || brand.startsWith('3g')) {
      return { mime: 'video/mp4', mediaType: 'video', ext: 'mp4' };
    }
    return null;
  }
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    const isWebm = head.subarray(0, MEDIA_SNIFF_BYTES).toString('latin1').includes('webm');
    return isWebm
      ? { mime: 'video/webm', mediaType: 'video', ext: 'webm' }
      : { mime: 'video/x-matroska', mediaType: 'video', ext: 'mkv' };
  }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { mime: 'audio/wav', mediaType: 'audio', ext: 'wav' };
  if (ascii(0, 4) === 'OggS') return { mime: 'audio/ogg', mediaType: 'audio', ext: 'ogg' };
  if (ascii(0, 4) === 'fLaC') return { mime: 'audio/flac', mediaType: 'audio', ext: 'flac' };
  if (ascii(0, 3) === 'ID3') return { mime: 'audio/mpeg', mediaType: 'audio', ext: 'mp3' };
  // Bare MPEG audio frame sync (no ID3 tag): 11 set bits, layer III.
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe6) === 0xe2) {
    return { mime: 'audio/mpeg', mediaType: 'audio', ext: 'mp3' };
  }
  // ADTS AAC.
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xf6) === 0xf0) {
    return { mime: 'audio/aac', mediaType: 'audio', ext: 'aac' };
  }
  return null;
}

/** A title for an uploaded file: its name without the extension. */
export function displayName(name: string | undefined | null, ext: string): string {
  const raw = (name ?? '').trim();
  if (!raw) return `Untitled ${ext.toUpperCase()}`;
  return raw.replace(/\.[a-z0-9]{1,5}$/i, '').trim() || raw;
}
