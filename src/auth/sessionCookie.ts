import type { Request, Response } from 'express';
import { env } from '../config/env';

export type SessionKind = 'user' | 'admin';

const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const COOKIES: Record<SessionKind, { name: string; path: string }> = {
  user: { name: 'dirah_refresh', path: '/api/auth' },
  admin: { name: 'dirah_admin_refresh', path: '/api/admin/auth' },
};

function cookieOptions(path: string) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.nodeEnv === 'production',
    path,
    maxAge: REFRESH_MAX_AGE_MS,
  };
}

export function setRefreshCookie(res: Response, kind: SessionKind, token: string): void {
  const spec = COOKIES[kind];
  res.cookie(spec.name, token, cookieOptions(spec.path));
}

export function clearRefreshCookie(res: Response, kind: SessionKind): void {
  const spec = COOKIES[kind];
  res.clearCookie(spec.name, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    path: spec.path,
  });
}

export function readRefreshCookie(req: Request, kind: SessionKind): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const name = COOKIES[kind].name;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

/** Cookie wins. A body token is accepted only when the cookie is absent, so an existing localStorage session can upgrade once. */
export function refreshTokenFromRequest(req: Request, kind: SessionKind): string {
  const fromCookie = readRefreshCookie(req, kind);
  if (fromCookie) return fromCookie;
  const body = req.body as { refreshToken?: unknown } | undefined;
  if (typeof body?.refreshToken === 'string' && body.refreshToken.length > 0) {
    return body.refreshToken;
  }
  return '';
}

export function withRefreshCookie<T extends { tokens: { accessToken: string; refreshToken: string } }>(
  res: Response,
  kind: SessionKind,
  result: T
): Omit<T, 'tokens'> & { tokens: { accessToken: string } } {
  setRefreshCookie(res, kind, result.tokens.refreshToken);
  return {
    ...result,
    tokens: { accessToken: result.tokens.accessToken },
  };
}
