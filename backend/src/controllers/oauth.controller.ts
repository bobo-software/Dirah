import type { Request, Response } from 'express';
import { z } from 'zod';
import { OAuthService } from '../services/OAuthService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';
import { env } from '../config/env';
import { HttpError } from '../utils/HttpError';
import { publicTokens, setRefreshCookie, withRefreshCookie } from '../auth/sessionCookie';

const exchangeSchema = z.object({
  code: z.string().min(1),
});

function failRedirect(message: string): string {
  return `${env.appPublicUrl}/login?oauth=${encodeURIComponent(message)}`;
}

function mobileRedirect(returnTo: string, params: Record<string, string>): string {
  const url = new URL(returnTo);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export function createOAuthController(oauth: OAuthService) {
  return {
    status: asyncHandler(async (_req: Request, res: Response) => {
      return ResponseUtils.success(res, 'ok', { oauth: oauth.status() });
    }),

    start: asyncHandler(async (req: Request, res: Response) => {
      const provider = req.params.provider ?? '';
      const returnTo = typeof req.query.return === 'string' ? req.query.return : undefined;
      const invite = typeof req.query.invite === 'string' ? req.query.invite : undefined;
      const url = oauth.authorizeUrl(provider, returnTo, invite);
      return res.redirect(302, url);
    }),

    callback: asyncHandler(async (req: Request, res: Response) => {
      const provider = req.params.provider ?? '';
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      if (typeof req.query.error === 'string' && req.query.error) {
        let returnTo: string | null = null;
        try {
          returnTo = oauth.mobileReturn(provider, state);
        } catch {
          returnTo = null;
        }
        if (returnTo) return res.redirect(302, mobileRedirect(returnTo, { error: 'Sign-in was cancelled' }));
        return res.redirect(302, failRedirect('Sign-in was cancelled'));
      }
      let returnTo: string | null = null;
      try {
        returnTo = oauth.mobileReturn(provider, state);
        const result = await oauth.finish(provider, code, state, { issueTokens: !returnTo });
        if (returnTo) {
          const oneTime = await oauth.createMobileCode(result.user.id);
          const params: Record<string, string> = { code: oneTime };
          if (result.joinedWorkspaceId) params.workspace = result.joinedWorkspaceId;
          return res.redirect(302, mobileRedirect(returnTo, params));
        }
        if (!result.tokens) {
          throw new HttpError('OAuth provider failed', 502, 'OAUTH_PROVIDER_ERROR');
        }
        setRefreshCookie(res, 'user', result.tokens.refreshToken);
        return res.redirect(302, oauth.appRedirect(result.joinedWorkspaceId));
      } catch (error) {
        if (error instanceof HttpError && (error.status === 400 || error.status === 502 || error.status === 503)) {
          if (returnTo) return res.redirect(302, mobileRedirect(returnTo, { error: error.message }));
          if (req.accepts('html')) {
            return res.redirect(302, failRedirect(error.message));
          }
        }
        throw error;
      }
    }),

    exchange: asyncHandler(async (req: Request, res: Response) => {
      const parsed = exchangeSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'A sign-in code is required', parsed.error.flatten(), 400);
      }
      const result = await oauth.exchangeMobileCode(parsed.data.code);
      return ResponseUtils.success(res, 'Logged in', {
        ...withRefreshCookie(res, 'user', result),
        tokens: publicTokens(req, result.tokens),
      });
    }),
  };
}
