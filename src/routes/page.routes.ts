import { Router } from 'express';
import { createPageController } from '../controllers/page.controller';
import { createDocController } from '../controllers/doc.controller';
import { createShareController } from '../controllers/share.controller';
import type { PageService } from '../services/PageService';
import type { DocSyncService } from '../services/DocSyncService';
import type { ShareService } from '../services/ShareService';
import { requireAuth } from '../middlewares/auth';

export function createPageRouter(
  pageService: PageService,
  sync: DocSyncService,
  shares: ShareService
): Router {
  const router = Router();
  const controller = createPageController(pageService);
  const docs = createDocController(sync);
  const share = createShareController(shares);

  router.use(requireAuth);
  router.get('/:id/markdown', controller.getMarkdown);
  router.put('/:id/markdown', controller.putMarkdown);
  router.get('/:id/updates', docs.updates);
  router.get('/:id/snapshots/:snapshotId', docs.getSnapshot);
  router.post('/:id/snapshots/:snapshotId/restore', docs.restoreSnapshot);
  router.get('/:id/snapshots', docs.listSnapshots);
  router.post('/:id/snapshots', docs.saveSnapshot);
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
