import { Router } from 'express';
import { createTicketController } from '../controllers/ticket.controller';
import type { TicketService } from '../services/TicketService';
import { requireAuth } from '../middlewares/auth';

export function createTicketBoardRouter(ticketService: TicketService): Router {
  const router = Router();
  const controller = createTicketController(ticketService);

  router.use(requireAuth);
  router.get('/:id', controller.getBoard);
  router.patch('/:id', controller.patchBoard);
  router.delete('/:id', controller.removeBoard);
  router.post('/:id/statuses', controller.createStatus);
  router.put('/:id/statuses/order', controller.orderStatuses);
  router.post('/:id/groups', controller.createGroup);
  router.put('/:id/groups/order', controller.orderGroups);
  router.post('/:id/tickets', controller.createTicket);

  return router;
}

export function createTicketStatusRouter(ticketService: TicketService): Router {
  const router = Router();
  const controller = createTicketController(ticketService);

  router.use(requireAuth);
  router.patch('/:id', controller.patchStatus);
  router.delete('/:id', controller.removeStatus);

  return router;
}

export function createTicketGroupRouter(ticketService: TicketService): Router {
  const router = Router();
  const controller = createTicketController(ticketService);

  router.use(requireAuth);
  router.patch('/:id', controller.patchGroup);
  router.delete('/:id', controller.removeGroup);

  return router;
}

export function createTicketRouter(ticketService: TicketService): Router {
  const router = Router();
  const controller = createTicketController(ticketService);

  router.use(requireAuth);
  router.get('/:id', controller.getTicket);
  router.patch('/:id', controller.patchTicket);
  router.delete('/:id', controller.removeTicket);
  router.put('/:id/move', controller.moveTicket);
  router.get('/:id/comments', controller.listComments);
  router.post('/:id/comments', controller.addComment);
  router.get('/:id/activity', controller.listActivity);

  return router;
}

export function createTicketCommentRouter(ticketService: TicketService): Router {
  const router = Router();
  const controller = createTicketController(ticketService);

  router.use(requireAuth);
  router.patch('/:id', controller.patchComment);
  router.delete('/:id', controller.removeComment);

  return router;
}
