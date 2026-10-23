import { Router } from 'express';
import { createPageController } from '../controllers/page.controller';
import { createShareController } from '../controllers/share.controller';
import type { PageService } from '../services/PageService';
import type { ShareService } from '../services/ShareService';
import { requireAuth } from '../middlewares/auth';

export function createPageRouter(pageService: PageService, shares: ShareService): Router {
  const router = Router();
  const controller = createPageController(pageService);
  const share = createShareController(shares);

  router.use(requireAuth);
  router.get('/:id/markdown', controller.getMarkdown);
  router.put('/:id/markdown', controller.putMarkdown);
  router.get('/:id/share', share.get);
  router.post('/:id/share', share.create);
  router.delete('/:id/share', share.revoke);
  router.post('/:id/restore', controller.restore);
  router.put('/:id/favorite', controller.favorite);
  router.delete('/:id/favorite', controller.unfavorite);
  router.delete('/:id/permanent', controller.removePermanent);
  router.patch('/:id', controller.patch);
  router.delete('/:id', controller.remove);

  return router;
}
