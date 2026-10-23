import { Router } from 'express';
import { createAiController } from '../controllers/ai.controller';
import type { AiService } from '../services/AiService';
import { requireAuth } from '../middlewares/auth';

export function createAiRouter(ai: AiService): Router {
  const router = Router();
  const controller = createAiController(ai);
  router.use(requireAuth);
  router.get('/status', controller.status);
  router.post('/pages/:id', controller.ask);
  return router;
}
