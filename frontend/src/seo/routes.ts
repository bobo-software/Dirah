import { SITE_DESCRIPTION, SITE_TAGLINE } from './site';

export type RouteMeta = {
  title: string;
  description: string;
  canonical: string;
  /** Pages behind the sign-in wall stay out of the index. */
  noIndex?: boolean;
};

/**
 * The public pages, with the wording search engines and chat previews show.
 * The API renders the same wording for crawlers that do not run JavaScript
 * (backend/src/services/SeoService.ts); keep the two in step.
 */
export const ROUTE_META: Record<string, RouteMeta> = {
  '/': {
    title: `Dirah — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    canonical: '/',
  },
  '/login': {
    title: 'Sign in',
    description: 'Sign in to your Dirah workspace to read and edit the pages your team shares with you.',
    canonical: '/login',
    noIndex: true,
  },
  '/register': {
    title: 'Create your workspace',
    description:
      'Create a Dirah workspace for your team’s specs, policies and decisions, then connect Claude, Cursor or any MCP client.',
    canonical: '/register',
    noIndex: true,
  },
  '/privacy': {
    title: 'Privacy policy',
    description:
      'What personal information Dirah collects, why, who we share it with, and how to get a copy or have it deleted.',
    canonical: '/privacy',
  },
  '/terms': {
    title: 'Terms of service',
    description: 'The terms that apply when you use Dirah, including your account, your content and how we can end it.',
    canonical: '/terms',
  },
  '/cookies': {
    title: 'Cookie notice',
    description: 'The cookies Dirah sets, what each one is for, and how long they stay on your device.',
    canonical: '/cookies',
  },
};

/** The workspace app itself: useful to a signed-in reader, not to a search engine. */
export const APP_META: RouteMeta = {
  title: 'Workspace',
  description: SITE_DESCRIPTION,
  canonical: '/',
  noIndex: true,
};
