import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import cors from 'cors';
import { z } from 'zod';
import type { McpOAuthService } from '../services/McpOAuthService';
import { HttpError } from '../utils/HttpError';
import { asyncHandler } from '../utils/asyncHandler';
import ResponseUtils from '../utils/ResponseUtils';
import { requireAuth } from '../middlewares/auth';

/** Paths served by the public router; app.ts keeps the app-origin CORS policy off them. */
export const MCP_OAUTH_PUBLIC_PATHS = /^\/(\.well-known\/|mcp\/oauth\/)/;

// Discovery, registration and token calls come from arbitrary clients (incl. browser-based
// ones like MCP Inspector) and never rely on cookies, so any origin is fine.
const publicCors = cors({
  origin: '*',
  methods: 'GET,POST,OPTIONS',
  allowedHeaders: 'Content-Type,Authorization,MCP-Protocol-Version',
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function sendOAuthError(res: Response, error: HttpError): void {
  const code = error.code ?? 'invalid_request';
  res.status(code === 'invalid_client' ? 401 : 400).json({
    error: code,
    error_description: error.message,
  });
}

/** Wrap an OAuth endpoint: no caching, and service HttpErrors become RFC 6749 error bodies. */
function oauthEndpoint(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof HttpError) {
        sendOAuthError(res, error);
        return;
      }
      next(error);
    }
  });
}

export function createMcpOAuthPublicRouter(oauth: McpOAuthService): Router {
  const router = Router();
  router.use((req, res, next) => (MCP_OAUTH_PUBLIC_PATHS.test(req.path) ? publicCors(req, res, next) : next()));

  const protectedResource = (_req: Request, res: Response) => {
    res.json(oauth.protectedResource());
  };
  const authServer = (_req: Request, res: Response) => {
    res.json(oauth.metadata());
  };
  router.get('/.well-known/oauth-protected-resource', protectedResource);
  router.get('/.well-known/oauth-protected-resource/mcp', protectedResource);
  router.get('/.well-known/oauth-authorization-server', authServer);
  router.get('/.well-known/openid-configuration', authServer);

  router.post(
    '/mcp/oauth/register',
    oauthEndpoint(async (req, res) => {
      const client = await oauth.register(req.body ?? {});
      res.status(201).json(client);
    })
  );

  router.get(
    '/mcp/oauth/authorize',
    asyncHandler(async (req: Request, res: Response) => {
      const outcome = await oauth.authorize(req.query as Record<string, unknown>);
      if (outcome.kind === 'error') {
        res
          .status(outcome.status)
          .type('html')
          .send(
            `<!doctype html><meta charset="utf-8"><title>Dirah authorization error</title>` +
              `<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">` +
              `<h1>Can't connect this app</h1><p>${escapeHtml(outcome.message)}</p>` +
              `<p>Try removing and re-adding the Dirah connector in your AI app.</p></body>`
          );
        return;
      }
      res.redirect(302, outcome.location);
    })
  );

  router.post(
    '/mcp/oauth/token',
    oauthEndpoint(async (req, res) => {
      res.json(await oauth.token(req.body ?? {}));
    })
  );

  router.post(
    '/mcp/oauth/revoke',
    oauthEndpoint(async (req, res) => {
      await oauth.revoke(req.body ?? {});
      res.status(200).end();
    })
  );

  return router;
}

const approveSchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.string().min(1),
  codeChallenge: z.string().optional(),
  state: z.string().optional(),
  resource: z.string().optional(),
  scope: z.string().optional(),
  deny: z.boolean().optional(),
  workspaces: z
    .array(z.object({ workspaceId: z.string().uuid(), canWrite: z.boolean().optional() }))
    .optional(),
});

const clientQuerySchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
});

export function createMcpOAuthApproveRouter(oauth: McpOAuthService): Router {
  const router = Router();
  router.use(requireAuth);
  router.get(
    '/oauth/client',
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = clientQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'client_id and redirect_uri are required', parsed.error.flatten(), 400);
      }
      const client = await oauth.describeClient(parsed.data.client_id, parsed.data.redirect_uri);
      return ResponseUtils.success(res, 'ok', client);
    })
  );
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
