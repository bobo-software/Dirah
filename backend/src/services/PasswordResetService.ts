import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db';
import { passwordResetCodes, refreshTokens, userCrypto, users } from '../db/schemas';
import { sendPasswordResetEmail } from '../mail/inviteMailer';
import { HttpError } from '../utils/HttpError';

const BCRYPT_ROUNDS = 12;
const COOLDOWN_MS = 60_000;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const recentSends = new Map<string, number>();
const testCodes = new Map<string, string>();

export function passwordResetCodeForTests(email: string): string | undefined {
  if (env.nodeEnv !== 'test') return undefined;
  return testCodes.get(normalizeEmail(email));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function codesMatch(storedHash: string, submitted: string): boolean {
  const left = Buffer.from(storedHash);
  const right = Buffer.from(hashCode(submitted));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function cooldownSeconds(sentAtMs: number, now: number): number {
  const left = COOLDOWN_MS - (now - sentAtMs);
  if (left <= 0) return 0;
  return Math.ceil(left / 1000);
}

function assertCooldown(sentAtMs: number | undefined, now: number): void {
  if (sentAtMs == null) return;
  const retryAfterSeconds = cooldownSeconds(sentAtMs, now);
  if (retryAfterSeconds > 0) {
    throw new HttpError('Too many attempts. Try again later.', 429, 'RATE_LIMITED', {
      retryAfterSeconds,
    });
  }
}

function rememberSend(email: string, now: number): void {
  if (recentSends.size > 2000) {
    const cutoff = now - COOLDOWN_MS;
    for (const [key, sent] of recentSends) {
      if (sent < cutoff) recentSends.delete(key);
    }
  }
  recentSends.set(email, now);
}

function issueCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export class PasswordResetService {
  constructor(private readonly database: typeof db) {}

  async requestReset(emailRaw: string): Promise<void> {
    if (env.nodeEnv === 'production' && !env.smtpConfigured) {
      throw new HttpError("Password reset email isn't available", 503, 'EMAIL_UNAVAILABLE');
    }

    const email = normalizeEmail(emailRaw);
    if (!email || !email.includes('@')) {
      throw new HttpError('A valid email is required', 400, 'INVALID_EMAIL');
    }

    const nowMs = Date.now();
    assertCooldown(recentSends.get(email), nowMs);

    const [user] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      rememberSend(email, nowMs);
      return;
    }

    const [latest] = await this.database
      .select({ sentAt: passwordResetCodes.sentAt })
      .from(passwordResetCodes)
      .where(eq(passwordResetCodes.userId, user.id))
      .orderBy(desc(passwordResetCodes.sentAt))
      .limit(1);
    assertCooldown(latest?.sentAt.getTime(), nowMs);

    const code = issueCode();
    const now = new Date(nowMs);
    await this.database.transaction(async (tx) => {
      await tx
        .update(passwordResetCodes)
        .set({ consumedAt: now })
        .where(and(eq(passwordResetCodes.userId, user.id), isNull(passwordResetCodes.consumedAt)));
      await tx.insert(passwordResetCodes).values({
        userId: user.id,
        codeHash: hashCode(code),
        expiresAt: new Date(nowMs + CODE_TTL_MS),
        sentAt: now,
        attempts: 0,
      });
    });

    rememberSend(email, nowMs);
    if (env.nodeEnv === 'test') testCodes.set(email, code);
    await sendPasswordResetEmail(email, code);
  }

  async resetPassword(
    emailRaw: string,
    code: string,
    password: string
  ): Promise<{ hasEncryptionKey: boolean }> {
    const email = normalizeEmail(emailRaw);
    if (!email || !email.includes('@')) {
      throw new HttpError('A valid email is required', 400, 'INVALID_EMAIL');
    }
    if (!/^\d{6}$/.test(code)) {
      throw new HttpError('That code is wrong or expired', 400, 'INVALID_CODE');
    }

    const [user] = await this.database
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user) {
      throw new HttpError('That code is wrong or expired', 400, 'INVALID_CODE');
    }

    const [row] = await this.database
      .select()
      .from(passwordResetCodes)
      .where(
        and(
          eq(passwordResetCodes.userId, user.id),
          isNull(passwordResetCodes.consumedAt),
          gt(passwordResetCodes.expiresAt, new Date()),
          lt(passwordResetCodes.attempts, MAX_ATTEMPTS)
        )
      )
      .orderBy(desc(passwordResetCodes.sentAt))
      .limit(1);

    if (!row || !codesMatch(row.codeHash, code)) {
      if (row) {
        const attempts = row.attempts + 1;
        await this.database
          .update(passwordResetCodes)
          .set({
            attempts,
            ...(attempts >= MAX_ATTEMPTS ? { consumedAt: new Date() } : {}),
          })
          .where(eq(passwordResetCodes.id, row.id));
      }
      throw new HttpError('That code is wrong or expired', 400, 'INVALID_CODE');
    }

    if (password.length < 8) {
      throw new HttpError('Password must be at least 8 characters', 400, 'WEAK_PASSWORD');
    }
    if (user.passwordHash && (await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError('Choose a different password', 400, 'PASSWORD_UNCHANGED');
    }

    const [existingCrypto] = await this.database
      .select({ publicKey: userCrypto.publicKey })
      .from(userCrypto)
      .where(eq(userCrypto.userId, user.id))
      .limit(1);

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const now = new Date();
    await this.database.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user.id));
      await tx
        .update(passwordResetCodes)
        .set({ consumedAt: now })
        .where(eq(passwordResetCodes.id, row.id));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));
    });

    testCodes.delete(email);
    return { hasEncryptionKey: Boolean(existingCrypto) };
  }
}
