import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env';

export const SYSTEM_ADMIN_ROLE = 'system_admin' as const;

export interface JwtPayload {
  userId: string;
  profileId?: string;
  role?: string;
  tokenId?: string;
}

export interface SystemAdminJwtPayload {
  adminId: string;
  role: typeof SYSTEM_ADMIN_ROLE;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '15m' });
}

export function signMcpAccessToken(userId: string, tokenId: string): string {
  return jwt.sign({ userId, role: 'mcp', tokenId } satisfies JwtPayload, env.jwtSecret, {
    expiresIn: '8h',
  });
}

export function signSystemAdminAccessToken(adminId: string): string {
  return jwt.sign(
    { adminId, role: SYSTEM_ADMIN_ROLE } satisfies SystemAdminJwtPayload,
    env.jwtSecret,
    { expiresIn: '15m' }
  );
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId, jti: crypto.randomUUID() }, env.jwtRefreshSecret, { expiresIn: '7d' });
}

export function signSystemAdminRefreshToken(adminId: string): string {
  return jwt.sign({ adminId, jti: crypto.randomUUID() }, env.jwtRefreshSecret, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload;
}

export function verifySystemAdminAccessToken(token: string): SystemAdminJwtPayload {
  const payload = jwt.verify(token, env.jwtSecret) as SystemAdminJwtPayload;
  if (payload.role !== SYSTEM_ADMIN_ROLE || !payload.adminId) {
    throw new Error('Invalid system admin token');
  }
  return payload;
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, env.jwtRefreshSecret) as { userId: string };
}

export function verifySystemAdminRefreshToken(token: string): { adminId: string } {
  return jwt.verify(token, env.jwtRefreshSecret) as { adminId: string };
}
