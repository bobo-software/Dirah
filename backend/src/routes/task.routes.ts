import { Router } from 'express';
import { createTaskController } from '../controllers/task.controller';
import type { TaskListService } from '../services/TaskListService';
import { requireAuth } from '../middlewares/auth';

export function createTaskListRouter(taskListService: TaskListService): Router {
  const router = Router();
  const controller = createTaskController(taskListService);

  router.use(requireAuth);
  router.post('/from-note', controller.createFromNote);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.patch);
  router.delete('/:id', controller.remove);
  router.post('/:id/items', controller.addItems);
  router.put('/:id/items/order', controller.orderItems);
  router.post('/:id/reset', controller.reset);

  return router;
}

export function createTaskItemRouter(taskListService: TaskListService): Router {
  const router = Router();
  const controller = createTaskController(taskListService);

  router.use(requireAuth);
  router.patch('/:id', controller.patchItem);
  router.delete('/:id', controller.removeItem);

  return router;
}
