import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { db } from '../db';
import { requestLogs } from '../db/schemas';
import { INTERNAL_ERROR } from './publicError';

const REDACTED_KEYS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'passwordHash',
  'code',
  'wrappedDek',
  'privateKey',
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  const clone: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    clone[key] = REDACTED_KEYS.has(key) ? '[REDACTED]' : redact(val);
  }
  return clone;
}

function logRequest(res: Response, success: boolean, message: string, payload: unknown) {
  const req = res.req as Request;
  res.once('finish', () => {
    const durationMs = Date.now() - (req.startTime ?? Date.now());
    db.insert(requestLogs)
      .values({
        id: randomUUID(),
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
        success,
        message,
        userId: req.user?.userId ?? null,
        userRole: req.user?.role ?? null,
        ip: req.ip ?? null,
        requestBody: redact(req.body) as Record<string, unknown> | null,
        responseBody: redact(payload) as Record<string, unknown> | null,
        createdAt: new Date(),
      })
      .catch((error) => {
        console.error('Failed to write request log', error);
      });
  });
}

class ResponseUtils {
  static success(res: Response, message: string, data: unknown = null, statusCode = 200) {
    logRequest(res, true, message, data);

    return res.status(statusCode).json({
      success: true,
      message,
      ...(data !== null && data !== undefined ? { data } : {}),
    });
  }

  static error(
    res: Response,
    message: string,
    error: unknown = null,
    statusCode = 500,
    extra: Record<string, unknown> = {}
  ) {
    // A raw Error on a 5xx can carry SQL or schema names; never send its message.
    const errorPayload =
      error instanceof Error ? (statusCode >= 500 ? INTERNAL_ERROR : error.message) : error;

    console.error({
      success: false,
      message,
      error: errorPayload,
      ...extra,
      timestamp: new Date().toISOString(),
    });

    logRequest(res, false, message, Object.keys(extra).length ? { error: errorPayload, ...extra } : errorPayload);

    return res.status(statusCode).json({
      success: false,
      message,
      ...(error ? { error: errorPayload } : {}),
      ...extra,
    });
  }
}

export default ResponseUtils;
