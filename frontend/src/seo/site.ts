export {
  OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_PATH,
  OG_IMAGE_WIDTH,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
} from './copy';

/** Public origin of the web app. The build may pin it (VITE_SITE_URL); otherwise
    the origin the browser is on is the right answer, which keeps self-hosted
    installs correct without a rebuild. */
export function siteOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  const configured = import.meta.env.VITE_SITE_URL?.trim();
  return configured ? configured.replace(/\/$/, '') : 'https://dirah.co.za';
}

/** Turns a path ("/privacy") into an absolute URL for canonical and og: tags. */
export function absoluteUrl(path: string, origin = siteOrigin()): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Strips markdown down to plain text so it can be used as a description. */
export function excerptFromMarkdown(markdown: string, maxLength = 200): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}
