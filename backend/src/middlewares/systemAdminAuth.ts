import type { NextFunction, Request, Response } from 'express';
import { verifySystemAdminAccessToken } from '../utils/jwt';
import ResponseUtils from '../utils/ResponseUtils';

export function requireSystemAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    ResponseUtils.error(res, 'Unauthorized', 'Missing token', 401);
    return;
  }

  try {
    const payload = verifySystemAdminAccessToken(header.slice('Bearer '.length).trim());
    req.systemAdmin = { adminId: payload.adminId };
    next();
  } catch {
    ResponseUtils.error(res, 'Unauthorized', 'Invalid token', 401);
  }
}
