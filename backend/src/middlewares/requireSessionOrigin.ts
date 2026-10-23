import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import ResponseUtils from '../utils/ResponseUtils';

/**
 * Browsers send Origin on cross-origin POSTs, including same-site sibling hosts.
 * A missing Origin is a non-browser client. A present Origin must match CORS_ORIGIN.
 */
export function requireSessionOrigin(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  if (env.corsOrigin === '*') {
    next();
    return;
  }
  const origin = req.get('origin');
  if (!origin) {
    next();
    return;
  }
  const allowed = env.corsOrigin.replace(/\/$/, '');
  if (origin.replace(/\/$/, '') !== allowed) {
    ResponseUtils.error(res, 'Origin is not allowed', 'ORIGIN_NOT_ALLOWED', 403);
    return;
  }
  next();
}
