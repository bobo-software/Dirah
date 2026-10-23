import type { Request, Response } from 'express';
import type { BlobService } from '../services/BlobService';
import type { NoteService } from '../services/NoteService';
import ResponseUtils from '../utils/ResponseUtils';
import { asyncHandler } from '../utils/asyncHandler';

export function createNoteAttachmentController(notes: NoteService, blobs: BlobService) {
  return {
    /** POST /api/notes/:id/attachments — raw image bytes; author only. */
    upload: asyncHandler(async (req: Request, res: Response) => {
      const note = await notes.requireAttachableNote(req.user!.userId, req.params.id);
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
      const blob = await blobs.uploadNoteImage(req.user!.userId, note, body);
      return ResponseUtils.success(
        res,
        'Attachment stored',
        { blob: { ...blob, url: `/api/blobs/${blob.id}` } },
        201
      );
    }),
  };
}
