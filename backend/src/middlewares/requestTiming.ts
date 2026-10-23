import type { NextFunction, Request, Response } from 'express';

export function requestTiming(req: Request, _res: Response, next: NextFunction): void {
  req.startTime = Date.now();
  next();
}
