import { describe, expect, it } from 'vitest';
import { buildSeoHead, escapeAttribute } from './head';

const HEAD = {
  siteUrl: 'https://dirah.co.za',
  title: 'Dirah — A context bank for your AI agents',
  description: 'A hosted workspace for your team’s specs, policies and decisions.',
  siteName: 'Dirah',
  imagePath: '/og.png',
  imageWidth: 1200,
  imageHeight: 630,
  imageAlt: 'Dirah — A context bank for your AI agents',
};

describe('buildSeoHead', () => {
  it('has the title, the description and the social preview tags', () => {
    const head = buildSeoHead(HEAD);
    expect(head).toContain('<title>Dirah — A context bank for your AI agents</title>');
    expect(head).toContain('<meta name="description" content="A hosted workspace');
    expect(head).toContain('<link rel="canonical" href="https://dirah.co.za/" />');
    expect(head).toContain('<meta property="og:image" content="https://dirah.co.za/og.png" />');
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it('keeps the URLs relative when the site has no fixed address', () => {
    const head = buildSeoHead({ ...HEAD, siteUrl: '' });
    expect(head).toContain('<link rel="canonical" href="/" />');
    expect(head).toContain('<meta property="og:image" content="/og.png" />');
  });
});

describe('escapeAttribute', () => {
  it('keeps a quote from ending the attribute early', () => {
    expect(escapeAttribute('a "quoted" word')).toBe('a &quot;quoted&quot; word');
  });

  it('escapes the characters that would start a tag', () => {
    expect(escapeAttribute('<script> & more')).toBe('&lt;script&gt; &amp; more');
  });
});
