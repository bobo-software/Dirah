import type { NextFunction, Request, Response } from 'express';

const hits = new Map<string, number[]>();

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function docsMcpRateLimit(req: Request, res: Response, next: NextFunction): void {
  const userId = req.mcpAuth?.userId;
  if (!userId) {
    next();
    return;
  }
  const max = intEnv('MCP_DOCS_RATE_LIMIT', 120);
  const windowMs = intEnv('MCP_DOCS_RATE_WINDOW_MS', 60_000);
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= max) {
    res.status(429).json({
      success: false,
      message: 'Too many MCP requests',
      error: 'RATE_LIMITED',
      timestamp: new Date().toISOString(),
    });
    return;
  }
  recent.push(now);
  hits.set(userId, recent);
  next();
}
