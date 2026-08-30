import { Router } from 'express';
import { createBlobController } from '../controllers/blob.controller';
import type { BlobService } from '../services/BlobService';
import { requireAuth } from '../middlewares/auth';

export function createBlobRouter(blobService: BlobService): Router {
  const router = Router();
  const controller = createBlobController(blobService);

  router.use(requireAuth);
  router.get('/:id', controller.download);
  router.delete('/:id', controller.remove);

  return router;
}
