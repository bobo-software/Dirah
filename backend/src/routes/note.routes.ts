import { Router, raw } from 'express';
import { createNoteController } from '../controllers/note.controller';
import { createNoteAttachmentController } from '../controllers/noteAttachment.controller';
import type { BlobService } from '../services/BlobService';
import type { NoteService } from '../services/NoteService';
import { requireAuth } from '../middlewares/auth';

export function createNoteRouter(noteService: NoteService, blobService: BlobService): Router {
  const router = Router();
  const controller = createNoteController(noteService);
  const attachments = createNoteAttachmentController(noteService, blobService);

  router.use(requireAuth);
  router.get('/:id/board', controller.getBoard);
  router.get('/:id/backlinks', controller.backlinks);
  router.post('/:id/columns', controller.createColumn);
  router.put('/:id/columns/order', controller.orderColumns);
  router.post('/:id/cards', controller.createCard);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.patch);
  router.put('/:id/content', controller.putContent);
  router.put('/:id/tags', controller.putTags);
  router.post('/:id/attachments', raw({ type: '*/*', limit: '12mb' }), attachments.upload);
  router.post('/:id/restore', controller.restore);
  router.delete('/:id/permanent', controller.removePermanent);
  router.delete('/:id', controller.remove);

  return router;
}

export function createKanbanColumnRouter(noteService: NoteService): Router {
  const router = Router();
  const controller = createNoteController(noteService);

  router.use(requireAuth);
  router.patch('/:id', controller.patchColumn);
  router.delete('/:id', controller.deleteColumn);

  return router;
}

export function createKanbanCardRouter(noteService: NoteService): Router {
  const router = Router();
  const controller = createNoteController(noteService);

  router.use(requireAuth);
  router.patch('/', controller.moveCard);
  router.delete('/', controller.removeCard);

  return router;
}

export function createNoteTagRouter(noteService: NoteService): Router {
  const router = Router();
  const controller = createNoteController(noteService);

  router.use(requireAuth);
  router.patch('/:tagId', controller.patchTag);
  router.delete('/:tagId', controller.deleteTag);

  return router;
}
