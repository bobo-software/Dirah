import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import ResponseUtils from '../utils/ResponseUtils';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    ResponseUtils.error(res, 'Unauthorized', 'Missing token', 401);
    return;
  }

  try {
    req.user = verifyAccessToken(header.slice('Bearer '.length).trim());
    next();
  } catch {
    ResponseUtils.error(res, 'Unauthorized', 'Invalid token', 401);
  }
}
