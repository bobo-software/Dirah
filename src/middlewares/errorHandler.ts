import { NextFunction, Request, Response } from 'express';
import ResponseUtils from '../utils/ResponseUtils';
import { HttpError } from '../utils/HttpError';

export function errorHandler(
  err: Error & { status?: number },
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof HttpError) {
    return ResponseUtils.error(res, err.message, err.code ?? err.message, err.status);
  }

  const statusCode = err.status ?? 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  if (statusCode === 500) {
    console.error(err);
  }

  return ResponseUtils.error(res, message, err, statusCode);
}
