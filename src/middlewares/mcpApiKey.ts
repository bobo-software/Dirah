import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { getMcpConfig } from '../config/mcp';

function unauthorized(res: Response): void {
  res.status(401).json({
    success: false,
    message: 'Unauthorized',
    error: 'Missing or invalid MCP API key',
    timestamp: new Date().toISOString(),
  });
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Require `Authorization: Bearer <MCP_API_KEY>` for MCP protocol routes.
 */
export function mcpApiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { apiKey } = getMcpConfig();
  if (!apiKey) {
    res.status(503).json({
      success: false,
      message: 'MCP is not configured',
      error: 'MCP_API_KEY is not set',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const header = req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    unauthorized(res);
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token || !safeEqual(token, apiKey)) {
    unauthorized(res);
    return;
  }

  next();
}
