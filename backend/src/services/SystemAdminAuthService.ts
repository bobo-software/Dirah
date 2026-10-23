import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { systemAdminRefreshTokens, systemAdmins } from '../db/schemas';
import {
  signSystemAdminAccessToken,
  signSystemAdminRefreshToken,
  verifySystemAdminRefreshToken,
} from '../utils/jwt';
import { HttpError } from '../utils/HttpError';

const BCRYPT_ROUNDS = 12;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Database = typeof db;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicSystemAdmin {
  id: string;
  email: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class SystemAdminAuthService {
  constructor(private readonly database: Database) {}

  async login(emailRaw: string, password: string): Promise<{
    admin: PublicSystemAdmin;
    tokens: AuthTokens;
  }> {
    const email = normalizeEmail(emailRaw);
    const [admin] = await this.database
      .select({
        id: systemAdmins.id,
        email: systemAdmins.email,
        passwordHash: systemAdmins.passwordHash,
      })
      .from(systemAdmins)
      .where(eq(systemAdmins.email, email))
      .limit(1);

    if (!admin) {
      throw new HttpError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const matches = await bcrypt.compare(password, admin.passwordHash);
    if (!matches) {
      throw new HttpError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const tokens = await this.issueTokens(admin.id);
    return { admin: { id: admin.id, email: admin.email }, tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: { adminId: string };
    try {
      payload = verifySystemAdminRefreshToken(refreshToken);
    } catch {
      throw new HttpError('Invalid refresh token', 401, 'INVALID_REFRESH');
    }

    if (!payload.adminId) {
      throw new HttpError('Invalid refresh token', 401, 'INVALID_REFRESH');
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const [row] = await this.database
      .select()
      .from(systemAdminRefreshTokens)
      .where(
        and(eq(systemAdminRefreshTokens.tokenHash, tokenHash), isNull(systemAdminRefreshTokens.revokedAt))
      )
      .limit(1);

    if (!row || row.adminId !== payload.adminId) {
      throw new HttpError('Invalid refresh token', 401, 'INVALID_REFRESH');
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new HttpError('Refresh token expired', 401, 'REFRESH_EXPIRED');
    }

    await this.database
      .update(systemAdminRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(systemAdminRefreshTokens.id, row.id));

    return this.issueTokens(payload.adminId);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    await this.database
      .update(systemAdminRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(systemAdminRefreshTokens.tokenHash, tokenHash), isNull(systemAdminRefreshTokens.revokedAt))
      );
  }

  async me(adminId: string): Promise<PublicSystemAdmin> {
    const [admin] = await this.database
      .select({ id: systemAdmins.id, email: systemAdmins.email })
      .from(systemAdmins)
      .where(eq(systemAdmins.id, adminId))
      .limit(1);

    if (!admin) {
      throw new HttpError('Admin not found', 401, 'ADMIN_NOT_FOUND');
    }
    return admin;
  }

  async bootstrapFromEnv(emailRaw: string, password: string): Promise<boolean> {
    const email = normalizeEmail(emailRaw);
    if (!email || !email.includes('@') || password.length < 8) {
      console.warn('SYSTEM_ADMIN_EMAIL/PASSWORD invalid; skipping bootstrap');
      return false;
    }

    const [existing] = await this.database
      .select({ id: systemAdmins.id, passwordHash: systemAdmins.passwordHash })
      .from(systemAdmins)
      .where(eq(systemAdmins.email, email))
      .limit(1);

    if (!existing) {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await this.database.insert(systemAdmins).values({ email, passwordHash });
      console.log(`Bootstrapped system admin ${email}`);
      return true;
    }

    const matches = await bcrypt.compare(password, existing.passwordHash);
    if (matches) return false;

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.database
      .update(systemAdmins)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(systemAdmins.id, existing.id));
    console.log(`Updated system admin password for ${email}`);
    return true;
  }

  private async issueTokens(adminId: string): Promise<AuthTokens> {
    const accessToken = signSystemAdminAccessToken(adminId);
    const refreshToken = signSystemAdminRefreshToken(adminId);
    await this.database.insert(systemAdminRefreshTokens).values({
      adminId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    return { accessToken, refreshToken };
  }
}
