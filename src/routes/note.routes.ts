import { Router } from 'express';
import { createNoteController } from '../controllers/note.controller';
import type { NoteService } from '../services/NoteService';
import { requireAuth } from '../middlewares/auth';

export function createNoteRouter(noteService: NoteService): Router {
  const router = Router();
  const controller = createNoteController(noteService);

  router.use(requireAuth);
  router.get('/:id/board', controller.getBoard);
  router.post('/:id/columns', controller.createColumn);
  router.put('/:id/columns/order', controller.orderColumns);
  router.post('/:id/cards', controller.createCard);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.patch);
  router.put('/:id/content', controller.putContent);
  router.put('/:id/tags', controller.putTags);
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
