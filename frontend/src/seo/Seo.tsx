import { useEffect, useMemo } from 'react';
import {
  OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_PATH,
  OG_IMAGE_WIDTH,
  SITE_DESCRIPTION,
  SITE_NAME,
  absoluteUrl,
} from './site';

export type SeoType = 'website' | 'article';

export type SeoProps = {
  /** Page title. The site name is appended unless the title already carries it. */
  title: string;
  description?: string;
  /** Path ("/privacy") or absolute URL. Defaults to the current location. */
  canonical?: string;
  /** Path or absolute URL of the social preview image. */
  image?: string;
  type?: SeoType;
  /** Keeps the page out of search results but still lets crawlers follow links. */
  noIndex?: boolean;
  /** ISO date, for articles. */
  publishedTime?: string;
  modifiedTime?: string;
  /** JSON-LD payload rendered as a script tag. */
  jsonLd?: unknown;
};

const JSON_LD_ID = 'dirah-json-ld';

function upsertMeta(attribute: 'name' | 'property', key: string, content: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function upsertLink(rel: string, href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

function removeMeta(attribute: 'name' | 'property', key: string): void {
  document.head.querySelector(`meta[${attribute}="${key}"]`)?.remove();
}

/**
 * Writes the head tags for a route: title, description, canonical URL, Open
 * Graph and Twitter card. The server renders the same tags for crawlers that
 * do not run JavaScript (chat previews, link unfurls), so this keeps the two
 * in step rather than replacing them.
 */
export function Seo({
  title,
  description = SITE_DESCRIPTION,
  canonical,
  image = OG_IMAGE_PATH,
  type = 'website',
  noIndex = false,
  publishedTime,
  modifiedTime,
  jsonLd,
}: SeoProps) {
  const canonicalUrl = absoluteUrl(canonical ?? window.location.pathname);
  const imageUrl = absoluteUrl(image);
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} · ${SITE_NAME}`;
  // Serialised once so a new object literal in a parent does not re-run the effect.
  const jsonLdText = useMemo(() => (jsonLd ? JSON.stringify(jsonLd) : undefined), [jsonLd]);

  useEffect(() => {
    document.title = fullTitle;

    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', noIndex ? 'noindex, follow' : 'index, follow');
    upsertLink('canonical', canonicalUrl);

    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('property', 'og:image', imageUrl);
    upsertMeta('property', 'og:image:width', String(OG_IMAGE_WIDTH));
    upsertMeta('property', 'og:image:height', String(OG_IMAGE_HEIGHT));
    upsertMeta('property', 'og:image:alt', OG_IMAGE_ALT);
    if (publishedTime) upsertMeta('property', 'article:published_time', publishedTime);
    else removeMeta('property', 'article:published_time');
    if (modifiedTime) upsertMeta('property', 'article:modified_time', modifiedTime);
    else removeMeta('property', 'article:modified_time');

    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', fullTitle);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', imageUrl);
    upsertMeta('name', 'twitter:image:alt', OG_IMAGE_ALT);

    const script = jsonLdText
      ? (() => {
          let node = document.getElementById(JSON_LD_ID) as HTMLScriptElement | null;
          if (!node) {
            node = document.createElement('script');
            node.id = JSON_LD_ID;
            node.type = 'application/ld+json';
            document.head.appendChild(node);
          }
          node.textContent = jsonLdText;
          return node;
        })()
      : null;

    return () => {
      script?.remove();
      // A page without a Seo of its own falls back to the site name.
      document.title = SITE_NAME;
    };
  }, [fullTitle, description, canonicalUrl, imageUrl, type, noIndex, publishedTime, modifiedTime, jsonLdText]);

  return null;
}
