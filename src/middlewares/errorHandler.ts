import { NextFunction, Request, Response } from 'express';
import ResponseUtils from '../utils/ResponseUtils';

export function errorHandler(
  err: Error & { status?: number },
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const statusCode = err.status ?? 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  if (statusCode === 500) {
    console.error(err);
  }

  return ResponseUtils.error(res, message, err, statusCode);
}
