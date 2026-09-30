import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { createIpRateLimit } from './authRateLimit';

function attempt(limit: ReturnType<typeof createIpRateLimit>, ip: string) {
  const req = { ip, socket: {} } as Request;
  let statusCode = 200;
  let body: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as Response;
  let nextCalled = false;
  limit(req, res, () => {
    nextCalled = true;
  });
  return { statusCode, body, nextCalled };
}

describe('auth rate limit', () => {
  it('blocks an IP after the configured number of attempts', () => {
    const limit = createIpRateLimit({
      max: 2,
      windowMs: 60_000,
      message: `unit-limit-${Date.now()}`,
    });
    expect(attempt(limit, '203.0.113.10').nextCalled).toBe(true);
    expect(attempt(limit, '203.0.113.10').nextCalled).toBe(true);
    const blocked = attempt(limit, '203.0.113.10');
    expect(blocked.nextCalled).toBe(false);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.body).toMatchObject({ success: false, error: 'RATE_LIMITED' });
    expect(attempt(limit, '203.0.113.11').nextCalled).toBe(true);
  });
});
