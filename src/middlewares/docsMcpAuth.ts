import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import type { McpTokenService } from '../services/McpTokenService';

function unauthorized(res: Response, apiPublicUrl: string): void {
  res.setHeader(
    'WWW-Authenticate',
    `Bearer realm="dira-docs", resource_metadata="${apiPublicUrl}/.well-known/oauth-protected-resource"`
  );
  res.status(401).json({
    success: false,
    message: 'Unauthorized',
    error: 'Missing or invalid MCP token',
    timestamp: new Date().toISOString(),
  });
}

export function createDocsMcpAuthMiddleware(options: {
  tokens: McpTokenService;
  apiPublicUrl: string;
}) {
  return async function docsMcpAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const header = req.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      unauthorized(res, options.apiPublicUrl);
      return;
    }
    const secret = header.slice('Bearer '.length).trim();
    if (!secret) {
      unauthorized(res, options.apiPublicUrl);
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
      if (payload.role === 'mcp' && payload.userId) {
        req.mcpAuth = { userId: payload.userId, tokenId: null };
        next();
        return;
      }
    } catch {
      unauthorized(res, options.apiPublicUrl);
      return;
    }
    unauthorized(res, options.apiPublicUrl);
  };
}
