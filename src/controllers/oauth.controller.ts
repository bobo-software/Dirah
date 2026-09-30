import type { Request, Response } from 'express';
import { OAuthService } from '../services/OAuthService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';
import { env } from '../config/env';
import { HttpError } from '../utils/HttpError';
import { setRefreshCookie } from '../auth/sessionCookie';

function failRedirect(message: string): string {
  return `${env.appPublicUrl}/login?oauth=${encodeURIComponent(message)}`;
}

export function createOAuthController(oauth: OAuthService) {
  return {
    status: asyncHandler(async (_req: Request, res: Response) => {
      return ResponseUtils.success(res, 'ok', { oauth: oauth.status() });
    }),

    start: asyncHandler(async (req: Request, res: Response) => {
      const provider = req.params.provider ?? '';
      const url = oauth.authorizeUrl(provider);
      return res.redirect(302, url);
    }),

    callback: asyncHandler(async (req: Request, res: Response) => {
      const provider = req.params.provider ?? '';
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      if (typeof req.query.error === 'string' && req.query.error) {
        return res.redirect(302, failRedirect('Sign-in was cancelled'));
      }
      try {
        const result = await oauth.finish(provider, code, state);
        setRefreshCookie(res, 'user', result.tokens.refreshToken);
        return res.redirect(302, oauth.appRedirect());
      } catch (error) {
        if (error instanceof HttpError && (error.status === 400 || error.status === 502 || error.status === 503)) {
          if (req.accepts('html')) {
            return res.redirect(302, failRedirect(error.message));
          }
        }
        throw error;
      }
    }),
  };
}
