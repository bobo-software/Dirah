import { z } from 'zod';
import type { Request, Response } from 'express';
import type { AiService } from '../services/AiService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';

const uuid = z.uuid();

const askSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  context: z.string().max(24000).optional(),
});

export function createAiController(ai: AiService) {
  return {
    status: asyncHandler(async (_req: Request, res: Response) => {
      return ResponseUtils.success(res, 'ok', { enabled: ai.enabled() });
    }),

    ask: asyncHandler(async (req: Request, res: Response) => {
      const parsedId = uuid.safeParse(req.params.id);
      if (!parsedId.success) {
        return ResponseUtils.error(res, 'Page id is required', null, 400);
      }
      const parsed = askSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return ResponseUtils.error(res, 'A prompt is required', parsed.error.flatten(), 400);
      }
      const reply = await ai.ask(
        req.user!.userId,
        parsedId.data,
        parsed.data.prompt,
        parsed.data.context ?? ''
      );
      return ResponseUtils.success(res, 'ok', { reply });
    }),
  };
}
