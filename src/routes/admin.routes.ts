import { Router } from 'express';
import { createAdminController } from '../controllers/admin.controller';
import type { SystemAdminAuthService } from '../services/SystemAdminAuthService';
import type { AdminService } from '../services/AdminService';
import { requireSystemAdmin } from '../middlewares/systemAdminAuth';

export function createAdminRouter(
  adminAuth: SystemAdminAuthService,
  adminService: AdminService
): Router {
  const router = Router();
  const controller = createAdminController(adminAuth, adminService);

  router.post('/auth/login', controller.login);
  router.post('/auth/refresh', controller.refresh);
  router.post('/auth/logout', controller.logout);
  router.get('/auth/me', requireSystemAdmin, controller.me);

  router.get('/metrics', requireSystemAdmin, controller.metrics);
  router.get('/users', requireSystemAdmin, controller.users);
  router.get('/emails', requireSystemAdmin, controller.emails);
  router.get('/request-logs/analytics', requireSystemAdmin, controller.requestAnalytics);
  router.get('/request-logs', requireSystemAdmin, controller.requestLogs);
  router.get('/mcp-audit', requireSystemAdmin, controller.mcpAudit);

  return router;
}
