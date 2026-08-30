import { z } from 'zod';
import type { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';

const credentialsSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export function createAuthController(authService: AuthService) {
  return {
    register: asyncHandler(async (req: Request, res: Response) => {
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Email and password are required', parsed.error.flatten(), 400);
      }
      const result = await authService.register(parsed.data.email, parsed.data.password);
      return ResponseUtils.success(res, 'Registered', result, 201);
    }),

    login: asyncHandler(async (req: Request, res: Response) => {
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Email and password are required', parsed.error.flatten(), 400);
      }
      const result = await authService.login(parsed.data.email, parsed.data.password);
      return ResponseUtils.success(res, 'Logged in', result);
    }),

    refresh: asyncHandler(async (req: Request, res: Response) => {
      const parsed = refreshSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'refreshToken is required', parsed.error.flatten(), 400);
      }
      const tokens = await authService.refresh(parsed.data.refreshToken);
      return ResponseUtils.success(res, 'Token refreshed', { tokens });
    }),

    logout: asyncHandler(async (req: Request, res: Response) => {
      const parsed = refreshSchema.safeParse(req.body);
      if (parsed.success) {
        await authService.logout(parsed.data.refreshToken);
      }
      return ResponseUtils.success(res, 'Logged out');
    }),

    me: asyncHandler(async (req: Request, res: Response) => {
      const user = await authService.me(req.user!.userId);
      return ResponseUtils.success(res, 'ok', { user });
    }),
  };
}
