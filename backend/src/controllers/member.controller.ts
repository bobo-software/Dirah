import { z } from 'zod';
import type { Request, Response } from 'express';
import { MemberService } from '../services/MemberService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';
import { withRefreshCookie } from '../auth/sessionCookie';

const inviteSchema = z.object({
  email: z.string().min(3),
  role: z.string().min(1),
});

const memberPatchSchema = z
  .object({
    role: z.string().min(1).optional(),
    hidden: z.boolean().optional(),
  })
  .refine((body) => body.role !== undefined || body.hidden !== undefined, {
    message: 'Send role or hidden',
  });

const memberWorkspacesSchema = z.object({
  workspaces: z
    .array(z.object({ workspaceId: z.string().uuid(), hidden: z.boolean() }))
    .max(500),
});

const acceptSchema = z.object({
  password: z.string().min(1).optional(),
  name: z.string().max(80).optional(),
});

export function createMemberController(members: MemberService) {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      if (!workspaceId) {
        return ResponseUtils.error(res, 'Workspace id is required', null, 400);
      }
      const list = await members.list(req.user!.userId, workspaceId);
      return ResponseUtils.success(res, 'ok', list);
    }),

    invite: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      if (!workspaceId) {
        return ResponseUtils.error(res, 'Workspace id is required', null, 400);
      }
      const parsed = inviteSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Email and role are required', parsed.error.flatten(), 400);
      }
      const outcome = await members.invite(
        req.user!.userId,
        workspaceId,
        parsed.data.email,
        parsed.data.role
      );
      return ResponseUtils.success(res, 'Invite created', { invite: outcome.invite }, 201);
    }),

    revokeInvite: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      const inviteId = req.params.inviteId;
      if (!workspaceId || !inviteId) {
        return ResponseUtils.error(res, 'Workspace id and invite id are required', null, 400);
      }
      await members.revokeInvite(req.user!.userId, workspaceId, inviteId);
      return ResponseUtils.success(res, 'Invite revoked');
    }),

    preview: asyncHandler(async (req: Request, res: Response) => {
      const token = req.params.token;
      if (!token) {
        return ResponseUtils.error(res, 'Invite token is required', null, 400);
      }
      const invite = await members.preview(token);
      return ResponseUtils.success(res, 'ok', { invite });
    }),

    accept: asyncHandler(async (req: Request, res: Response) => {
      const token = req.params.token;
      if (!token) {
        return ResponseUtils.error(res, 'Invite token is required', null, 400);
      }
      if (req.user?.userId) {
        const result = await members.acceptAsUser(token, req.user.userId);
        return ResponseUtils.success(res, 'Joined workspace', result, 201);
      }
      const parsed = acceptSchema.safeParse(req.body ?? {});
      if (!parsed.success || !parsed.data.password) {
        return ResponseUtils.error(res, 'Password is required', parsed.success ? null : parsed.error.flatten(), 400);
      }
      const result = await members.accept(token, parsed.data.password, parsed.data.name);
      return ResponseUtils.success(res, 'Joined workspace', withRefreshCookie(res, 'user', result), 201);
    }),

    setRole: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      const userId = req.params.userId;
      if (!workspaceId || !userId) {
        return ResponseUtils.error(res, 'Workspace id and user id are required', null, 400);
      }
      const parsed = memberPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Role or hidden is required', parsed.error.flatten(), 400);
      }
      const { role, hidden } = parsed.data;
      let member = role !== undefined ? await members.setRole(req.user!.userId, workspaceId, userId, role) : null;
      if (hidden !== undefined) {
        member = await members.setVisibility(req.user!.userId, workspaceId, userId, hidden);
      }
      return ResponseUtils.success(res, 'ok', { member });
    }),

    memberWorkspaces: asyncHandler(async (req: Request, res: Response) => {
      const userId = req.params.userId;
      if (!userId) {
        return ResponseUtils.error(res, 'User id is required', null, 400);
      }
      const workspaces = await members.workspacesForMember(req.user!.userId, userId);
      return ResponseUtils.success(res, 'ok', { workspaces });
    }),

    setMemberWorkspaces: asyncHandler(async (req: Request, res: Response) => {
      const userId = req.params.userId;
      if (!userId) {
        return ResponseUtils.error(res, 'User id is required', null, 400);
      }
      const parsed = memberWorkspacesSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid workspaces payload', parsed.error.flatten(), 400);
      }
      const workspaces = await members.setWorkspacesForMember(req.user!.userId, userId, parsed.data.workspaces);
      return ResponseUtils.success(res, 'ok', { workspaces });
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      const workspaceId = req.params.id;
      const userId = req.params.userId;
      if (!workspaceId || !userId) {
        return ResponseUtils.error(res, 'Workspace id and user id are required', null, 400);
      }
      await members.remove(req.user!.userId, workspaceId, userId);
      return ResponseUtils.success(res, 'Member removed');
    }),
  };
}
