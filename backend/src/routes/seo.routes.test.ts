import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSeoRouter } from './seo.routes';
import { SeoRenderer, buildSeoHead, buildRobotsTxt, buildSitemapXml, injectSeoHead } from '../services/SeoService';
import type { ShareService } from '../services/ShareService';
import { HttpError } from '../utils/HttpError';

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!--seo:head-->
    <title>Dirah</title>
    <!--/seo:head-->
  </head>
  <body><div id="root"></div></body>
</html>`;

/** Renders with a fixed shell so the test does not need the built web app. */
const renderer = {
  render: async (page: Parameters<SeoRenderer['render']>[0]) =>
    injectSeoHead(SHELL, buildSeoHead(page, 'https://dirah.co.za')),
} as unknown as SeoRenderer;

const shares = {
  getPublicMetadata: async (token: string) => {
    if (token === 'missing') throw new HttpError('Share link not found', 404, 'SHARE_NOT_FOUND');
    return {
      title: 'Q3 roadmap',
      excerpt: 'What we are building this quarter and why.',
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    };
  },
} as unknown as ShareService;

function app() {
  const server = express();
  server.use(createSeoRouter(shares, renderer));
  return server;
}

describe('SEO pages', () => {
  it('gives the home page a title, a description and a social preview', async () => {
    const response = await request(app()).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<title>Dirah — A context bank for your AI agents</title>');
    expect(response.text).toContain('<meta name="description"');
    expect(response.text).toContain('<meta property="og:image" content="https://dirah.co.za/og.png" />');
    expect(response.text).toContain('<link rel="canonical" href="https://dirah.co.za/" />');
    expect(response.text).toContain('<meta name="robots" content="index, follow" />');
  });

  it('keeps the sign-in pages out of the index', async () => {
    const response = await request(app()).get('/login');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<meta name="robots" content="noindex, follow" />');
  });

  it('gives each legal page its own title', async () => {
    const response = await request(app()).get('/privacy');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<title>Privacy policy · Dirah</title>');
    expect(response.text).toContain('<link rel="canonical" href="https://dirah.co.za/privacy" />');
  });

  it('shows the document a shared link points at', async () => {
    const response = await request(app()).get('/s/abc123');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<title>Q3 roadmap · Dirah</title>');
    expect(response.text).toContain('<meta property="og:type" content="article" />');
    expect(response.text).toContain(
      '<meta property="og:description" content="What we are building this quarter and why." />'
    );
    expect(response.text).toContain('<link rel="canonical" href="https://dirah.co.za/s/abc123" />');
    expect(response.text).toContain('"@type":"Article"');
  });

  it('answers a link that is gone with a page that is not indexed', async () => {
    const response = await request(app()).get('/s/missing');
    expect(response.status).toBe(404);
    expect(response.text).toContain('<title>Link not found · Dirah</title>');
    expect(response.text).toContain('<meta name="robots" content="noindex, follow" />');
  });

  it('keeps the app script and the root element of the shell', async () => {
    const response = await request(app()).get('/');
    expect(response.text).toContain('<div id="root"></div>');
    expect(response.text).not.toContain('<!--seo:head-->');
  });
});

describe('robots.txt and sitemap.xml', () => {
  it('points at the sitemap and keeps the app out of the way', () => {
    const robots = buildRobotsTxt('https://dirah.co.za');
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Disallow: /w/');
    expect(robots).toContain('Sitemap: https://dirah.co.za/sitemap.xml');
  });

  it('lists the public pages and nothing else', () => {
    const sitemap = buildSitemapXml('https://dirah.co.za');
    expect(sitemap).toContain('<loc>https://dirah.co.za/</loc>');
    expect(sitemap).toContain('<loc>https://dirah.co.za/privacy</loc>');
    expect(sitemap).not.toContain('/login');
  });

  it('serves both', async () => {
    const server = app();
    expect((await request(server).get('/robots.txt')).text).toContain('Sitemap:');
    expect((await request(server).get('/sitemap.xml')).text).toContain('<urlset');
  });
});

describe('when the web app is unreachable', () => {
  it('says so, so nginx can fall back to the static shell', async () => {
    // Nothing listens on port 1.
    const renderer = new SeoRenderer({ shellUrl: 'http://127.0.0.1:1', fetchTimeoutMs: 500 });
    await expect(
      renderer.render({ title: 'Dirah', description: 'x', path: '/' })
    ).rejects.toThrow('The web app is not reachable');
  });
});
