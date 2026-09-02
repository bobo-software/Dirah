import { Router } from 'express';
import { createMcpSettingsController } from '../controllers/mcpSettings.controller';
import type { McpTokenService } from '../services/McpTokenService';
import { requireAuth } from '../middlewares/auth';

export function createMcpSettingsRouter(tokens: McpTokenService): Router {
  const router = Router();
  const controller = createMcpSettingsController(tokens);
  router.use(requireAuth);
  router.get('/tokens', controller.listTokens);
  router.post('/tokens', controller.createToken);
  router.patch('/tokens/:id', controller.updateToken);
  router.delete('/tokens/:id', controller.revokeToken);
  router.get('/tokens/:id/access', controller.getTokenAccess);
  router.put('/tokens/:id/access', controller.setTokenAccess);
  return router;
}
