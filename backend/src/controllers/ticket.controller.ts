import { z } from 'zod';
import type { Request, Response } from 'express';
import {
  MAX_COMMENT_BODY,
  MAX_TICKET_DESCRIPTION,
  MAX_TICKET_LABEL,
  MAX_TICKET_LABELS,
  MAX_TICKET_TITLE,
  TICKET_COLORS,
  TICKET_PRIORITIES,
  TICKET_STATUS_CATEGORIES,
  TicketService,
} from '../services/TicketService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';

const uuid = z.uuid();
const color = z.enum(TICKET_COLORS);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const boardCreateSchema = z.object({
  name: z.string().max(120).optional(),
  key: z.string().max(10).optional(),
  description: z.string().max(2000).nullable().optional(),
});

const boardPatchSchema = boardCreateSchema.extend({
  position: z.number().int().optional(),
});

const statusCreateSchema = z.object({
  name: z.string().max(60),
  color: color.optional(),
  category: z.enum(TICKET_STATUS_CATEGORIES).optional(),
});

const statusPatchSchema = statusCreateSchema.partial();

const groupCreateSchema = z.object({
  name: z.string().max(80),
  color: color.optional(),
});

const groupPatchSchema = groupCreateSchema.partial();

const orderSchema = z.object({ ids: z.array(uuid).min(1) });

const removeWithTargetSchema = z.object({ moveTo: uuid.optional() });

const ticketFields = {
  description: z.string().max(MAX_TICKET_DESCRIPTION).optional(),
  groupId: uuid.optional(),
  statusId: uuid.optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  dueDate: isoDate.nullable().optional(),
  labels: z.array(z.string().max(MAX_TICKET_LABEL)).max(MAX_TICKET_LABELS).optional(),
  assigneeIds: z.array(uuid).max(50).optional(),
};

const ticketCreateSchema = z.object({ title: z.string().max(MAX_TICKET_TITLE), ...ticketFields });

const ticketPatchSchema = z.object({ title: z.string().max(MAX_TICKET_TITLE).optional(), ...ticketFields });

const ticketMoveSchema = z.object({
  groupId: uuid.optional(),
  position: z.number().int().min(0).optional(),
  statusId: uuid.optional(),
  statusPosition: z.number().int().min(0).optional(),
});

const searchSchema = z.object({
  q: z.string().max(200).optional(),
  assignee: z.union([z.literal('me'), uuid]).optional(),
  boardId: uuid.optional(),
  state: z.enum([...TICKET_STATUS_CATEGORIES, 'open']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const commentSchema = z.object({ body: z.string().max(MAX_COMMENT_BODY) });

export function createTicketController(ticketService: TicketService) {
  return {
    listBoards: asyncHandler(async (req: Request, res: Response) => {
      const boards = await ticketService.listBoards(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'ok', { boards });
    }),

    createBoard: asyncHandler(async (req: Request, res: Response) => {
      const parsed = boardCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid board payload', parsed.error.flatten(), 400);
      }
      const view = await ticketService.createBoard(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'Board created', view, 201);
    }),

    search: asyncHandler(async (req: Request, res: Response) => {
      const parsed = searchSchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid ticket search', parsed.error.flatten(), 400);
      }
      const { assignee, ...rest } = parsed.data;
      const userId = req.user!.userId;
      const tickets = await ticketService.search(userId, req.params.id, {
        ...rest,
        assigneeId: assignee === 'me' ? userId : assignee,
      });
      return ResponseUtils.success(res, 'ok', { tickets });
    }),

    getByKey: asyncHandler(async (req: Request, res: Response) => {
      const detail = await ticketService.getTicketByKey(req.user!.userId, req.params.id, req.params.key);
      return ResponseUtils.success(res, 'ok', detail);
    }),

    getBoard: asyncHandler(async (req: Request, res: Response) => {
      const view = await ticketService.getBoard(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'ok', view);
    }),

    patchBoard: asyncHandler(async (req: Request, res: Response) => {
      const parsed = boardPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid board payload', parsed.error.flatten(), 400);
      }
      const board = await ticketService.patchBoard(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'Board updated', { board });
    }),

    removeBoard: asyncHandler(async (req: Request, res: Response) => {
      await ticketService.removeBoard(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'Board deleted', null);
    }),

    createStatus: asyncHandler(async (req: Request, res: Response) => {
      const parsed = statusCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid status payload', parsed.error.flatten(), 400);
      }
      const status = await ticketService.createStatus(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'Status created', { status }, 201);
    }),

    orderStatuses: asyncHandler(async (req: Request, res: Response) => {
      const parsed = orderSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid status order', parsed.error.flatten(), 400);
      }
      const statuses = await ticketService.orderStatuses(req.user!.userId, req.params.id, parsed.data.ids);
      return ResponseUtils.success(res, 'Statuses reordered', { statuses });
    }),

    patchStatus: asyncHandler(async (req: Request, res: Response) => {
      const parsed = statusPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid status payload', parsed.error.flatten(), 400);
      }
      const status = await ticketService.patchStatus(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'Status updated', { status });
    }),

    removeStatus: asyncHandler(async (req: Request, res: Response) => {
      const parsed = removeWithTargetSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid status delete', parsed.error.flatten(), 400);
      }
      const view = await ticketService.removeStatus(req.user!.userId, req.params.id, parsed.data.moveTo);
      return ResponseUtils.success(res, 'Status deleted', view);
    }),

    createGroup: asyncHandler(async (req: Request, res: Response) => {
      const parsed = groupCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid group payload', parsed.error.flatten(), 400);
      }
      const group = await ticketService.createGroup(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'Group created', { group }, 201);
    }),

    orderGroups: asyncHandler(async (req: Request, res: Response) => {
      const parsed = orderSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid group order', parsed.error.flatten(), 400);
      }
      const groups = await ticketService.orderGroups(req.user!.userId, req.params.id, parsed.data.ids);
      return ResponseUtils.success(res, 'Groups reordered', { groups });
    }),

    patchGroup: asyncHandler(async (req: Request, res: Response) => {
      const parsed = groupPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid group payload', parsed.error.flatten(), 400);
      }
      const group = await ticketService.patchGroup(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'Group updated', { group });
    }),

    removeGroup: asyncHandler(async (req: Request, res: Response) => {
      const parsed = removeWithTargetSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid group delete', parsed.error.flatten(), 400);
      }
      const view = await ticketService.removeGroup(req.user!.userId, req.params.id, parsed.data.moveTo);
      return ResponseUtils.success(res, 'Group deleted', view);
    }),

    createTicket: asyncHandler(async (req: Request, res: Response) => {
      const parsed = ticketCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid ticket payload', parsed.error.flatten(), 400);
      }
      const ticket = await ticketService.createTicket(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'Ticket created', { ticket }, 201);
    }),

    getTicket: asyncHandler(async (req: Request, res: Response) => {
      const detail = await ticketService.getTicket(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'ok', detail);
    }),

    patchTicket: asyncHandler(async (req: Request, res: Response) => {
      const parsed = ticketPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid ticket payload', parsed.error.flatten(), 400);
      }
      const ticket = await ticketService.patchTicket(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'Ticket updated', { ticket });
    }),

    moveTicket: asyncHandler(async (req: Request, res: Response) => {
      const parsed = ticketMoveSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid ticket move', parsed.error.flatten(), 400);
      }
      const view = await ticketService.moveTicket(req.user!.userId, req.params.id, parsed.data);
      return ResponseUtils.success(res, 'Ticket moved', view);
    }),

    removeTicket: asyncHandler(async (req: Request, res: Response) => {
      await ticketService.removeTicket(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'Ticket deleted', null);
    }),

    listComments: asyncHandler(async (req: Request, res: Response) => {
      const comments = await ticketService.listComments(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'ok', { comments });
    }),

    addComment: asyncHandler(async (req: Request, res: Response) => {
      const parsed = commentSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid comment', parsed.error.flatten(), 400);
      }
      const comment = await ticketService.addComment(req.user!.userId, req.params.id, parsed.data.body);
      return ResponseUtils.success(res, 'Comment added', { comment }, 201);
    }),

    patchComment: asyncHandler(async (req: Request, res: Response) => {
      const parsed = commentSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'Invalid comment', parsed.error.flatten(), 400);
      }
      const comment = await ticketService.patchComment(req.user!.userId, req.params.id, parsed.data.body);
      return ResponseUtils.success(res, 'Comment updated', { comment });
    }),

    removeComment: asyncHandler(async (req: Request, res: Response) => {
      await ticketService.removeComment(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'Comment deleted', null);
    }),

    listActivity: asyncHandler(async (req: Request, res: Response) => {
      const activity = await ticketService.listActivity(req.user!.userId, req.params.id);
      return ResponseUtils.success(res, 'ok', { activity });
    }),
  };
}
