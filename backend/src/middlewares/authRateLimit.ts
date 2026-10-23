import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

type Bucket = {
  max: number;
  windowMs: number;
  message: string;
};

const hits = new Map<string, number[]>();

export function createIpRateLimit(bucket: Bucket) {
  return function ipRateLimit(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${bucket.message}:${ip}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < bucket.windowMs);
    if (recent.length >= bucket.max) {
      hits.set(key, recent);
      res.status(429).json({
        success: false,
        message: bucket.message,
        error: 'RATE_LIMITED',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

function skipInTest(limit: ReturnType<typeof createIpRateLimit>) {
  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    if (env.nodeEnv === 'test') {
      next();
      return;
    }
    limit(req, res, next);
  };
}

export const authLoginRateLimit = skipInTest(
  createIpRateLimit({
    max: env.authRateLimit.loginMax,
    windowMs: env.authRateLimit.loginWindowMs,
    message: 'Too many attempts. Try again later.',
  })
);

export const authPasswordResetRateLimit = skipInTest(
  createIpRateLimit({
    max: env.authRateLimit.loginMax,
    windowMs: env.authRateLimit.loginWindowMs,
    message: 'Too many password reset attempts. Try again later.',
  })
);

export const authRefreshRateLimit = skipInTest(
  createIpRateLimit({
    max: env.authRateLimit.refreshMax,
    windowMs: env.authRateLimit.refreshWindowMs,
    message: 'Too many refresh attempts. Try again later.',
  })
);
