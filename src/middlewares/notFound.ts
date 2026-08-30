import { Request, Response } from 'express';
import ResponseUtils from '../utils/ResponseUtils';

export function notFound(_req: Request, res: Response) {
  return ResponseUtils.error(res, 'Not found', null, 404);
}
