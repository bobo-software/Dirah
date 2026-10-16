import { z } from 'zod';
import type { Request, Response } from 'express';
import type { SystemAdminAuthService } from '../services/SystemAdminAuthService';
import type { AdminService } from '../services/AdminService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';
import {
  clearRefreshCookie,
  refreshTokenFromRequest,
  setRefreshCookie,
  withRefreshCookie,
} from '../auth/sessionCookie';
import { sendTestEmail } from '../mail/inviteMailer';

const credentialsSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

const testEmailSchema = z.object({
  to: z.string().trim().min(3),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const requestLogsQuerySchema = paginationSchema.extend({
  success: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  statusCode: z.coerce.number().int().optional(),
  method: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export function createAdminController(
  adminAuth: SystemAdminAuthService,
  adminService: AdminService
) {
  return {
    login: asyncHandler(async (req: Request, res: Response) => {
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Email and password are required', parsed.error.flatten(), 400);
      }
      const result = await adminAuth.login(parsed.data.email, parsed.data.password);
      return ResponseUtils.success(res, 'Logged in', withRefreshCookie(res, 'admin', result));
    }),

    refresh: asyncHandler(async (req: Request, res: Response) => {
      const refreshToken = refreshTokenFromRequest(req, 'admin');
      if (!refreshToken) {
        return ResponseUtils.error(res, 'refreshToken is required', null, 400);
      }
      const tokens = await adminAuth.refresh(refreshToken);
      setRefreshCookie(res, 'admin', tokens.refreshToken);
      return ResponseUtils.success(res, 'Token refreshed', {
        tokens: { accessToken: tokens.accessToken },
      });
    }),

    logout: asyncHandler(async (req: Request, res: Response) => {
      const refreshToken = refreshTokenFromRequest(req, 'admin');
      if (refreshToken) {
        await adminAuth.logout(refreshToken);
      }
      clearRefreshCookie(res, 'admin');
      return ResponseUtils.success(res, 'Logged out');
    }),

    me: asyncHandler(async (req: Request, res: Response) => {
      const admin = await adminAuth.me(req.systemAdmin!.adminId);
      return ResponseUtils.success(res, 'ok', { admin });
    }),

    metrics: asyncHandler(async (_req: Request, res: Response) => {
      const metrics = await adminService.metrics();
      return ResponseUtils.success(res, 'ok', { metrics });
    }),

    users: asyncHandler(async (req: Request, res: Response) => {
      const parsed = paginationSchema.safeParse(req.query);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid pagination', parsed.error.flatten(), 400);
      }
      const result = await adminService.listUsers(parsed.data.page, parsed.data.pageSize);
      return ResponseUtils.success(res, 'ok', result);
    }),

    emails: asyncHandler(async (req: Request, res: Response) => {
      const parsed = paginationSchema.safeParse(req.query);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid pagination', parsed.error.flatten(), 400);
      }
      const result = await adminService.listEmails(parsed.data.page, parsed.data.pageSize);
      return ResponseUtils.success(res, 'ok', result);
    }),

    sendTestEmail: asyncHandler(async (req: Request, res: Response) => {
      const parsed = testEmailSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'A valid email is required', parsed.error.flatten(), 400);
      }
      const to = parsed.data.to.toLowerCase();
      if (!to.includes('@')) {
        return ResponseUtils.error(res, 'A valid email is required', 'INVALID_EMAIL', 400);
      }
      await sendTestEmail(to);
      return ResponseUtils.success(res, 'Test email sent', { to });
    }),

    requestLogs: asyncHandler(async (req: Request, res: Response) => {
      const parsed = requestLogsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid query', parsed.error.flatten(), 400);
      }
      const { page, pageSize, success, statusCode, method, from, to } = parsed.data;
      const result = await adminService.listRequestLogs(page, pageSize, {
        success,
        statusCode,
        method,
        from,
        to,
      });
      return ResponseUtils.success(res, 'ok', result);
    }),

    requestAnalytics: asyncHandler(async (req: Request, res: Response) => {
      const hours = Number(req.query.hours ?? 24);
      const windowHours = Number.isFinite(hours) ? Math.min(Math.max(Math.floor(hours), 1), 168) : 24;
      const analytics = await adminService.requestAnalytics(windowHours);
      return ResponseUtils.success(res, 'ok', { analytics });
    }),

    mcpAudit: asyncHandler(async (req: Request, res: Response) => {
      const parsed = paginationSchema
        .extend({
          tool: z.string().optional(),
          outcome: z.string().optional(),
        })
        .safeParse(req.query);
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid query', parsed.error.flatten(), 400);
      }
      const result = await adminService.listMcpAudit(parsed.data.page, parsed.data.pageSize, {
        tool: parsed.data.tool,
        outcome: parsed.data.outcome,
      });
      return ResponseUtils.success(res, 'ok', result);
    }),
  };
}
