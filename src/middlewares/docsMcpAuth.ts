import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import type { McpTokenService } from '../services/McpTokenService';

function unauthorized(res: Response, apiPublicUrl: string, tokenSent: boolean): void {
  const params = [
    'realm="dirah-docs"',
    `resource_metadata="${apiPublicUrl}/.well-known/oauth-protected-resource"`,
    'scope="dirah.docs"',
  ];
  if (tokenSent) params.push('error="invalid_token"');
  res.setHeader('WWW-Authenticate', `Bearer ${params.join(', ')}`);
  res.status(401).json({
    success: false,
    message: 'Unauthorized',
    error: 'Missing or invalid MCP token',
    timestamp: new Date().toISOString(),
  });
}

function audienceMatches(aud: string | string[] | undefined, resource: string): boolean {
  // Tokens minted before audience binding have no `aud`; they expire on their own.
  if (aud === undefined) return true;
  const list = Array.isArray(aud) ? aud : [aud];
  return list.some((value) => value.replace(/\/+$/, '') === resource);
}

export function createDocsMcpAuthMiddleware(options: {
  tokens: McpTokenService;
  apiPublicUrl: string;
  /** Canonical `/mcp` resource URI that OAuth access tokens must be issued for. */
  resource: string;
}) {
  return async function docsMcpAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const header = req.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      unauthorized(res, options.apiPublicUrl, false);
      return;
    }
    const secret = header.slice('Bearer '.length).trim();
    if (!secret) {
      unauthorized(res, options.apiPublicUrl, false);
      return;
    }
    try {
      const pat = await options.tokens.resolveSecret(secret);
      if (pat) {
        req.mcpAuth = pat;
        next();
        return;
      }
      const payload = verifyAccessToken(secret);
      if (payload.role === 'mcp' && payload.userId && audienceMatches(payload.aud, options.resource)) {
        if (payload.tokenId) {
          const usable = await options.tokens.isTokenUsable(payload.tokenId);
          if (!usable) {
            unauthorized(res, options.apiPublicUrl, true);
            return;
          }
          req.mcpAuth = {
            userId: payload.userId,
            tokenId: payload.tokenId,
            defaultWorkspaceId: usable.defaultWorkspaceId,
          };
          next();
          return;
        }
        req.mcpAuth = { userId: payload.userId, tokenId: null, defaultWorkspaceId: null };
        next();
        return;
      }
    } catch {
      unauthorized(res, options.apiPublicUrl, true);
      return;
    }
    unauthorized(res, options.apiPublicUrl, true);
  };
}
