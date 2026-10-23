import { Request, Response } from 'express';
import ResponseUtils from '../utils/ResponseUtils';

export function getHealth(_req: Request, res: Response) {
  return ResponseUtils.success(res, 'ok', {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
