import { z } from 'zod';
import type { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { PasswordResetService } from '../services/PasswordResetService';
import ResponseUtils from '../utils/ResponseUtils';
import { HttpError } from '../utils/HttpError';
import { asyncHandler } from '../utils/asyncHandler';
import {
  clearRefreshCookie,
  publicTokens,
  refreshTokenFromRequest,
  setRefreshCookie,
  withRefreshCookie,
} from '../auth/sessionCookie';

const credentialsSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

const updateProfileSchema = z
  .object({
    name: z.string().max(80).nullable().optional(),
    role: z.string().max(80).nullable().optional(),
    about: z.string().max(280).nullable().optional(),
    email: z.string().min(1).optional(),
    currentPassword: z.string().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined || data.role !== undefined || data.about !== undefined || data.email !== undefined,
    { message: 'Nothing to update' }
  );

const cryptoRewrapSchema = z.object({
  publicKey: z.string().min(1),
  wrappedPrivateKey: z.string().min(1),
  kdfSalt: z.string().min(1),
  kdfIterations: z.number().int().min(1000),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(1),
  crypto: cryptoRewrapSchema.optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().min(1),
});

const resetPasswordSchema = z.object({
  email: z.string().min(1),
  code: z.string().min(1),
  password: z.string().min(1),
});

function sendRateLimit(res: Response, error: unknown): boolean {
  if (!(error instanceof HttpError) || error.status !== 429) return false;
  const retryAfterSeconds = error.details?.retryAfterSeconds;
  res.status(429).json({
    success: false,
    message: error.message,
    error: 'RATE_LIMITED',
    ...(typeof retryAfterSeconds === 'number' ? { retryAfterSeconds } : {}),
  });
  return true;
}

export function createAuthController(authService: AuthService, passwordResets: PasswordResetService) {
  return {
    register: asyncHandler(async (req: Request, res: Response) => {
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Email and password are required', parsed.error.flatten(), 400);
      }
      const result = await authService.register(parsed.data.email, parsed.data.password);
      return ResponseUtils.success(
        res,
        'Registered',
        { ...withRefreshCookie(res, 'user', result), tokens: publicTokens(req, result.tokens) },
        201
      );
    }),

    login: asyncHandler(async (req: Request, res: Response) => {
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Email and password are required', parsed.error.flatten(), 400);
      }
      const result = await authService.login(parsed.data.email, parsed.data.password);
      return ResponseUtils.success(res, 'Logged in', {
        ...withRefreshCookie(res, 'user', result),
        tokens: publicTokens(req, result.tokens),
      });
    }),

    refresh: asyncHandler(async (req: Request, res: Response) => {
      const refreshToken = refreshTokenFromRequest(req, 'user');
      if (!refreshToken) {
        return ResponseUtils.error(res, 'refreshToken is required', null, 400);
      }
      const tokens = await authService.refresh(refreshToken);
      setRefreshCookie(res, 'user', tokens.refreshToken);
      return ResponseUtils.success(res, 'Token refreshed', {
        tokens: publicTokens(req, tokens),
      });
    }),

    logout: asyncHandler(async (req: Request, res: Response) => {
      const refreshToken = refreshTokenFromRequest(req, 'user');
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
      clearRefreshCookie(res, 'user');
      return ResponseUtils.success(res, 'Logged out');
    }),

    me: asyncHandler(async (req: Request, res: Response) => {
      const user = await authService.me(req.user!.userId);
      return ResponseUtils.success(res, 'ok', { user });
    }),

    updateProfile: asyncHandler(async (req: Request, res: Response) => {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Profile details are invalid', parsed.error.flatten(), 400);
      }
      const user = await authService.updateProfile(req.user!.userId, parsed.data);
      return ResponseUtils.success(res, 'Profile updated', { user });
    }),

    changePassword: asyncHandler(async (req: Request, res: Response) => {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'A new password is required', parsed.error.flatten(), 400);
      }
      const user = await authService.changePassword(
        req.user!.userId,
        parsed.data.newPassword,
        parsed.data.currentPassword,
        parsed.data.crypto,
        refreshTokenFromRequest(req, 'user') ?? undefined
      );
      return ResponseUtils.success(res, 'Password updated', { user });
    }),

    forgotPassword: asyncHandler(async (req: Request, res: Response) => {
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'A valid email is required', parsed.error.flatten(), 400);
      }
      try {
        await passwordResets.requestReset(parsed.data.email);
      } catch (error) {
        if (sendRateLimit(res, error)) return;
        throw error;
      }
      return ResponseUtils.success(res, 'If an account exists for that email, we sent a code.');
    }),

    resetPassword: asyncHandler(async (req: Request, res: Response) => {
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Email, code, and a new password are required', parsed.error.flatten(), 400);
      }
      try {
        const result = await passwordResets.resetPassword(
          parsed.data.email,
          parsed.data.code,
          parsed.data.password
        );
        return ResponseUtils.success(res, 'Password updated', result);
      } catch (error) {
        if (sendRateLimit(res, error)) return;
        throw error;
      }
    }),
  };
}
