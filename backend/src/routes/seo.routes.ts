import { Router, type Response } from 'express';
import { HttpError } from '../utils/HttpError';
import {
  PUBLIC_PAGES,
  SeoRenderer,
  buildRobotsTxt,
  buildSitemapXml,
  siteOrigin,
  type SeoPage,
} from '../services/SeoService';
import type { ShareService } from '../services/ShareService';

/**
 * Renders the pages a stranger can reach, with the head tags a crawler reads.
 * A link pasted into a chat is fetched by a crawler that never runs
 * JavaScript, so the tags have to be in the HTML the API sends.
 */
export function createSeoRouter(shares: ShareService, renderer: SeoRenderer): Router {
  const router = Router();

  const send = async (res: Response, page: SeoPage, status = 200): Promise<void> => {
    const html = await renderer.render(page);
    // The page is the same for every reader, so a cache may keep it for a
    // minute. A renamed document shows up after that.
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(status).type('html').send(html);
  };

  router.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(buildRobotsTxt());
  });

  router.get('/sitemap.xml', (_req, res) => {
    res.type('application/xml').send(buildSitemapXml());
  });

  for (const [path, meta] of Object.entries(PUBLIC_PAGES)) {
    router.get(path, async (_req, res, next) => {
      try {
        await send(res, {
          title: meta.title,
          description: meta.description,
          path,
          noIndex: meta.noIndex,
          jsonLd:
            path === '/'
              ? {
                  '@context': 'https://schema.org',
                  '@type': 'SoftwareApplication',
                  name: 'Dirah',
                  description: meta.description,
                  applicationCategory: 'BusinessApplication',
                  operatingSystem: 'Web',
                  url: `${siteOrigin()}/`,
                  offers: { '@type': 'Offer', price: '0', priceCurrency: 'ZAR' },
                }
              : undefined,
        });
      } catch (error) {
        next(error);
      }
    });
  }

  router.get('/s/:token', async (req, res, next) => {
    const path = `/s/${req.params.token}`;
    try {
      const meta = await shares.getPublicMetadata(req.params.token);
      await send(res, {
        title: meta.title,
        description: meta.excerpt || 'A page shared from Dirah.',
        path,
        type: 'article',
        modifiedTime: meta.updatedAt?.toISOString(),
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: meta.title,
          description: meta.excerpt || 'A page shared from Dirah.',
          mainEntityOfPage: `${siteOrigin()}${path}`,
          dateModified: meta.updatedAt?.toISOString(),
          author: { '@type': 'Organization', name: 'Dirah' },
          publisher: { '@type': 'Organization', name: 'Dirah' },
        },
      });
    } catch (error) {
      if (error instanceof HttpError && (error.status === 404 || error.status === 409)) {
        try {
          await send(
            res,
            {
              title: 'Link not found',
              description: 'This share link is not available.',
              path,
              noIndex: true,
            },
            404
          );
        } catch (renderError) {
          next(renderError);
        }
        return;
      }
      next(error);
    }
  });

  return router;
}
