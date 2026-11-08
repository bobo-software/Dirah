import type { Plugin } from 'vite';
import {
  OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_PATH,
  OG_IMAGE_WIDTH,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
} from '../src/seo/copy.ts';
import { SEO_HEAD_END, SEO_HEAD_START, buildSeoHead } from '../src/seo/head.ts';

/* The head of index.html is generated at build time so a crawler that does
   not run JavaScript still sees a title, a description and a social preview.
   The API replaces the same block with per-page tags for the pages it
   renders (backend/src/services/SeoService.ts), so the markers below are a
   contract between the two: keep them. */

export type SeoHeadOptions = {
  /** Public origin of the web app, without a trailing slash. */
  siteUrl: string;
};

export function seoHeadPlugin(options: SeoHeadOptions): Plugin {
  const block = buildSeoHead({
    siteUrl: options.siteUrl,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    imagePath: OG_IMAGE_PATH,
    imageWidth: OG_IMAGE_WIDTH,
    imageHeight: OG_IMAGE_HEIGHT,
    imageAlt: OG_IMAGE_ALT,
  });
  return {
    name: 'dirah-seo-head',
    transformIndexHtml(html) {
      const marked = `${SEO_HEAD_START}\n    ${block}\n    ${SEO_HEAD_END}`;
      if (html.includes(SEO_HEAD_START) && html.includes(SEO_HEAD_END)) {
        return html.replace(/<!--seo:head-->[\s\S]*?<!--\/seo:head-->/, marked);
      }
      return html.replace('</head>', `  ${marked}\n  </head>`);
    },
  };
}
