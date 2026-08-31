import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import type { McpOAuthService } from '../services/McpOAuthService';
import { HttpError } from '../utils/HttpError';
import { asyncHandler } from '../utils/asyncHandler';
import ResponseUtils from '../utils/ResponseUtils';
import { requireAuth } from '../middlewares/auth';

function oauthError(res: Response, status: number, error: string, description: string): void {
  res.status(status).json({ error, error_description: description });
}

export function createMcpOAuthPublicRouter(oauth: McpOAuthService): Router {
  const router = Router();

  router.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json(oauth.protectedResource());
  });
  router.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json(oauth.metadata());
  });

  router.post(
    '/mcp/oauth/register',
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const body = (req.body ?? {}) as { client_name?: string; redirect_uris?: string[] };
        const client = await oauth.register(body);
        res.status(201).json(client);
      } catch (error) {
        if (error instanceof HttpError) {
          oauthError(res, error.status, 'invalid_client_metadata', error.message);
          return;
        }
        throw error;
      }
    })
  );

  router.get('/mcp/oauth/authorize', (req: Request, res: Response) => {
    const q = req.query as Record<string, string | undefined>;
    res.redirect(302, oauth.authorizeRedirect(q));
  });

  router.post(
    '/mcp/oauth/token',
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const body = (req.body ?? {}) as {
          grant_type?: string;
          code?: string;
          redirect_uri?: string;
          client_id?: string;
          code_verifier?: string;
        };
        const token = await oauth.token(body);
        res.json(token);
      } catch (error) {
        if (error instanceof HttpError) {
          oauthError(res, error.status, 'invalid_grant', error.message);
          return;
        }
        throw error;
      }
    })
  );

  return router;
}

const approveSchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.string().min(1),
  codeChallenge: z.string().min(1),
  state: z.string().optional(),
});

export function createMcpOAuthApproveRouter(oauth: McpOAuthService): Router {
  const router = Router();
  router.use(requireAuth);
  router.post(
    '/oauth/approve',
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = approveSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid OAuth approve payload', parsed.error.flatten(), 400);
      }
      const result = await oauth.approve(req.user!.userId, parsed.data);
      return ResponseUtils.success(res, 'ok', result);
    })
  );
  return router;
}
