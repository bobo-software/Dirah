import { env } from '../config/env';
import { HttpError } from '../utils/HttpError';

/* The wording search engines and chat previews show. The web app keeps the
   same copy in frontend/src/seo/copy.ts: change one, change the other.
   The API renders it because a link pasted into a chat is fetched by a crawler
   that never runs JavaScript, and that crawler only sees the HTML we send. */

export const SITE_NAME = 'Dirah';
export const SITE_TAGLINE = 'A context bank for your AI agents';
export const SITE_DESCRIPTION =
  'Dirah is a hosted workspace for your team’s specs, policies and decisions. Connect Claude, Cursor or any MCP client, and your agents search, read and update the same pages your team does.';

export const OG_IMAGE_PATH = '/og.png';
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;
const OG_IMAGE_ALT = `${SITE_NAME} — ${SITE_TAGLINE}`;

/** Markers the web build writes around the head block it generates. The API
    swaps what sits between them for the tags of the page being viewed. */
export const SEO_HEAD_START = '<!--seo:head-->';
export const SEO_HEAD_END = '<!--/seo:head-->';

export type SeoPage = {
  title: string;
  description: string;
  /** Path on the web app, e.g. "/privacy". */
  path: string;
  type?: 'website' | 'article';
  noIndex?: boolean;
  modifiedTime?: string;
  jsonLd?: unknown;
};

export type PublicPageMeta = {
  title: string;
  description: string;
  noIndex?: boolean;
};

/** The pages a stranger can reach. Everything else needs a sign-in. */
export const PUBLIC_PAGES: Record<string, PublicPageMeta> = {
  '/': {
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  '/login': {
    title: 'Sign in',
    description: 'Sign in to your Dirah workspace to read and edit the pages your team shares with you.',
    noIndex: true,
  },
  '/register': {
    title: 'Create your workspace',
    description:
      'Create a Dirah workspace for your team’s specs, policies and decisions, then connect Claude, Cursor or any MCP client.',
    noIndex: true,
  },
  '/privacy': {
    title: 'Privacy policy',
    description:
      'What personal information Dirah collects, why, who we share it with, and how to get a copy or have it deleted.',
  },
  '/terms': {
    title: 'Terms of service',
    description:
      'The terms that apply when you use Dirah, including your account, your content and how we can end it.',
  },
  '/cookies': {
    title: 'Cookie notice',
    description: 'The cookies Dirah sets, what each one is for, and how long they stay on your device.',
  },
};

/** Public address of the web app, used for canonical links and preview images. */
export function siteOrigin(): string {
  return env.appPublicUrl.replace(/\/$/, '');
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Builds the head block for one page: title, description, canonical link,
    Open Graph, Twitter card and optional structured data. */
export function buildSeoHead(page: SeoPage, origin = siteOrigin()): string {
  const title = page.title.includes(SITE_NAME) ? page.title : `${page.title} · ${SITE_NAME}`;
  const canonical = `${origin}${page.path}`;
  const image = `${origin}${OG_IMAGE_PATH}`;
  const type = page.type ?? 'website';
  const lines = [
    `<title>${escapeAttribute(title)}</title>`,
    `<meta name="description" content="${escapeAttribute(page.description)}" />`,
    `<meta name="robots" content="${page.noIndex ? 'noindex, follow' : 'index, follow'}" />`,
    `<link rel="canonical" href="${escapeAttribute(canonical)}" />`,
    `<meta property="og:site_name" content="${escapeAttribute(SITE_NAME)}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:title" content="${escapeAttribute(title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(page.description)}" />`,
    `<meta property="og:url" content="${escapeAttribute(canonical)}" />`,
    `<meta property="og:image" content="${escapeAttribute(image)}" />`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />`,
    `<meta property="og:image:alt" content="${escapeAttribute(OG_IMAGE_ALT)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttribute(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(page.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttribute(image)}" />`,
    `<meta name="twitter:image:alt" content="${escapeAttribute(OG_IMAGE_ALT)}" />`,
  ];
  if (page.modifiedTime) {
    lines.push(`<meta property="article:modified_time" content="${escapeAttribute(page.modifiedTime)}" />`);
  }
  if (page.jsonLd) {
    lines.push(
      `<script type="application/ld+json">${JSON.stringify(page.jsonLd).replace(/</g, '\\u003c')}</script>`
    );
  }
  return lines.join('\n    ');
}

/** Puts the head block of a page into the shell the web app serves. */
export function injectSeoHead(html: string, head: string): string {
  const start = SEO_HEAD_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const end = SEO_HEAD_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const marked = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (marked.test(html)) {
    return html.replace(marked, head);
  }
  return html.replace('</head>', `    ${head}\n  </head>`);
}

export function buildRobotsTxt(origin = siteOrigin()): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /w/',
    'Disallow: /settings',
    'Disallow: /admin',
    'Disallow: /invite/',
    'Disallow: /oauth',
    'Disallow: /mcp',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

export function buildSitemapXml(origin = siteOrigin()): string {
  const paths = Object.entries(PUBLIC_PAGES)
    .filter(([, meta]) => !meta.noIndex)
    .map(([path]) => path);
  const urls = paths
    .map((path) => `  <url>\n    <loc>${origin}${path}</loc>\n    <changefreq>weekly</changefreq>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** Thrown when the built web app cannot be reached, so nginx can fall back to
    the static shell instead of showing an error. */
export class SeoShellUnavailableError extends HttpError {
  constructor() {
    super('The web app is not reachable', 503, 'SEO_UNAVAILABLE');
  }
}

const SHELL_BACKOFF_MS = 30_000;
const SHELL_TIMEOUT_MS = 4_000;

/**
 * Renders a page for crawlers: the shell the web app serves, with the head
 * block of the page swapped in. The shell is the built index.html, fetched
 * from the web app so the asset names always match the running build.
 */
export class SeoRenderer {
  private shell: { html: string; etag: string | null } | null = null;
  private failedAt = 0;

  constructor(
    private readonly options: { fetchTimeoutMs?: number; shellUrl?: string } = {}
  ) {}

  async render(page: SeoPage): Promise<string> {
    const shell = await this.loadShell();
    return injectSeoHead(shell, buildSeoHead(page));
  }

  private async loadShell(): Promise<string> {
    const cached = this.shell;
    const now = Date.now();
    // The web app is unreachable. Do not wait for the timeout on every request.
    if (now - this.failedAt < SHELL_BACKOFF_MS) {
      if (cached) return cached.html;
      throw new SeoShellUnavailableError();
    }
    const origin = (this.options.shellUrl || env.webInternalUrl || env.appPublicUrl).replace(/\/$/, '');
    try {
      const headers: Record<string, string> = {};
      if (cached?.etag) headers['if-none-match'] = cached.etag;
      const response = await fetch(`${origin}/index.html`, {
        headers,
        signal: AbortSignal.timeout(this.options.fetchTimeoutMs ?? SHELL_TIMEOUT_MS),
      });
      if (response.status === 304 && cached) {
        return cached.html;
      }
      if (response.ok) {
        const html = await response.text();
        if (html.includes('</head>')) {
          this.shell = { html, etag: response.headers.get('etag') };
          this.failedAt = 0;
          return html;
        }
      }
    } catch {
      // The web app is unreachable right now; a stale shell still beats an error.
    }
    this.failedAt = now;
    if (cached) return cached.html;
    throw new SeoShellUnavailableError();
  }
}

