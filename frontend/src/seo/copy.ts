/* The wording search engines, chat previews and the marketing pages all use.
   Kept free of any browser or build-time API so the Vite plugin, the app and
   the API can share it. The API renders the same copy for crawlers that do
   not run JavaScript (backend/src/services/SeoService.ts): keep the two in
   step when the wording changes. */

export const SITE_NAME = 'Dirah';
export const SITE_TAGLINE = 'A context bank for your AI agents';
export const SITE_DESCRIPTION =
  'Dirah is a hosted workspace for your team’s specs, policies and decisions. Connect Claude, Cursor or any MCP client, and your agents search, read and update the same pages your team does.';

/** Social preview image. 1200x630 is the size every platform expects. */
export const OG_IMAGE_PATH = '/og.png';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_ALT = `${SITE_NAME} — ${SITE_TAGLINE}`;
