import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env';

export interface JwtPayload {
  userId: string;
  profileId?: string;
  role?: string;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '15m' });
}

export function signMcpAccessToken(userId: string): string {
  return jwt.sign({ userId, role: 'mcp' } satisfies JwtPayload, env.jwtSecret, { expiresIn: '8h' });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId, jti: crypto.randomUUID() }, env.jwtRefreshSecret, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload;
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, env.jwtRefreshSecret) as { userId: string };
}
