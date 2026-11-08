export type NodeKind = 'folder' | 'markdown' | 'asset';
export type AssetMedia = 'image' | 'video' | 'audio';

export function pageKind(page: { kind?: string | null }): NodeKind {
  if (page.kind === 'folder') return 'folder';
  if (page.kind === 'asset') return 'asset';
  return 'markdown';
}

const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'mkv']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac']);

/** An asset's media type from the extension its slug ends in (hero.png, clip.mp4). */
export function assetMedia(page: { slug?: string | null }): AssetMedia {
  const ext = /\.([a-z0-9]+)$/.exec(page.slug ?? '')?.[1] ?? '';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  return 'image';
}

export function kindLabel(kind: NodeKind): string {
  return kind === 'folder' ? 'Folder' : kind === 'asset' ? 'Media' : 'Markdown';
}

export function kindGlyph(kind: NodeKind, page?: { slug?: string | null }): string {
  if (kind === 'folder') return '📁';
  if (kind === 'asset') {
    const media = assetMedia(page ?? {});
    return media === 'video' ? '🎬' : media === 'audio' ? '🎵' : '🖼';
  }
  return 'MD';
}

export function canHaveChildren(kind: NodeKind): boolean {
  return kind === 'folder';
}
