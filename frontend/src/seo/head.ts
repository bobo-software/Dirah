/* Builds the head block the web app serves. The Vite plugin writes it into
   index.html (plugins/seoHead.ts) and the API writes it into the pages it
   renders for a crawler (backend/src/services/SeoService.ts). */

export const SEO_HEAD_START = '<!--seo:head-->';
export const SEO_HEAD_END = '<!--/seo:head-->';

/** Quotes and angle brackets would end the attribute or the tag early. */
export function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export type SeoHeadOptions = {
  /** Public origin of the web app, without a trailing slash. Empty keeps the
      URLs relative, which is right for a self-hosted install that has no
      fixed address: the app rewrites them to the runtime origin on load. */
  siteUrl: string;
  title: string;
  description: string;
  siteName: string;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  imageAlt: string;
};

export function buildSeoHead(options: SeoHeadOptions): string {
  const base = options.siteUrl;
  const image = `${base}${options.imagePath}`;
  const canonical = `${base}/`;
  return [
    `<title>${escapeAttribute(options.title)}</title>`,
    `<meta name="description" content="${escapeAttribute(options.description)}" />`,
    // The shell is what the app behind the sign-in wall is served as. The API
    // replaces this block with the tags of the page it renders, and the app
    // rewrites it for the route being viewed.
    `<meta name="robots" content="noindex, follow" />`,
    `<link rel="canonical" href="${escapeAttribute(canonical)}" />`,
    `<meta property="og:site_name" content="${escapeAttribute(options.siteName)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeAttribute(options.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(options.description)}" />`,
    `<meta property="og:url" content="${escapeAttribute(canonical)}" />`,
    `<meta property="og:image" content="${escapeAttribute(image)}" />`,
    `<meta property="og:image:width" content="${options.imageWidth}" />`,
    `<meta property="og:image:height" content="${options.imageHeight}" />`,
    `<meta property="og:image:alt" content="${escapeAttribute(options.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttribute(options.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(options.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttribute(image)}" />`,
    `<meta name="twitter:image:alt" content="${escapeAttribute(options.imageAlt)}" />`,
  ].join('\n    ');
}
