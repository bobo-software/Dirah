import { NextFunction, Request, Response } from 'express';
import ResponseUtils from '../utils/ResponseUtils';
import { toPublicError } from '../utils/publicError';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const { status, message, code, requestId } = toPublicError(err);
  if (requestId) {
    res.setHeader('X-Request-Id', requestId);
    return ResponseUtils.error(res, message, code, status, { requestId });
  }
  return ResponseUtils.error(res, message, code ?? message, status);
}
