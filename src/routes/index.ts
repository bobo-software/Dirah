import { Router } from 'express';
import { healthRouter } from './health.routes';
import { createAuthRouter } from './auth.routes';
import { createWorkspaceRouter } from './workspace.routes';
import { createPageRouter } from './page.routes';
import { createBlobRouter } from './blob.routes';
import { createPublicRouter } from './public.routes';
import { createInviteRouter } from './invite.routes';
import { createAiRouter } from './ai.routes';
import type { AuthService } from '../services/AuthService';
import type { PageService } from '../services/PageService';
import type { BlobService } from '../services/BlobService';
import type { DocSyncService } from '../services/DocSyncService';
import type { MemberService } from '../services/MemberService';
import type { ShareService } from '../services/ShareService';
import type { AiService } from '../services/AiService';
import type { CryptoService } from '../services/CryptoService';

export function createApiRouter(
  authService: AuthService,
  pageService: PageService,
  blobService: BlobService,
  sync: DocSyncService,
  memberService: MemberService,
  shareService: ShareService,
  aiService: AiService,
  cryptoService: CryptoService
): Router {
  const router = Router();
  router.use('/health', healthRouter);
  router.use('/auth', createAuthRouter(authService, cryptoService));
  router.use('/workspaces', createWorkspaceRouter(authService, pageService, blobService, memberService, cryptoService));
  router.use('/pages', createPageRouter(pageService, sync, shareService));
  router.use('/blobs', createBlobRouter(blobService));
  router.use('/public', createPublicRouter(shareService, sync, blobService));
  router.use('/invites', createInviteRouter(memberService));
  router.use('/ai', createAiRouter(aiService));
  return router;
}
