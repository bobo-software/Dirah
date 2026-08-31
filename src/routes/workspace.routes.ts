import { Router, raw } from 'express';
import { createWorkspaceController } from '../controllers/workspace.controller';
import { createPageController } from '../controllers/page.controller';
import { createBlobController } from '../controllers/blob.controller';
import { createMemberController } from '../controllers/member.controller';
import { createCryptoController } from '../controllers/crypto.controller';
import type { AuthService } from '../services/AuthService';
import type { PageService } from '../services/PageService';
import type { BlobService } from '../services/BlobService';
import type { MemberService } from '../services/MemberService';
import type { CryptoService } from '../services/CryptoService';
import type { McpTokenService } from '../services/McpTokenService';
import { requireAuth } from '../middlewares/auth';

export function createWorkspaceRouter(
  authService: AuthService,
  pageService: PageService,
  blobService: BlobService,
  memberService: MemberService,
  cryptoService: CryptoService,
  mcpTokenService?: McpTokenService
): Router {
  const router = Router();
  const controller = createWorkspaceController(authService, mcpTokenService);
  const pages = createPageController(pageService);
  const blobs = createBlobController(blobService);
  const members = createMemberController(memberService);
  const crypto = createCryptoController(cryptoService);

  router.use(requireAuth);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id/pages', pages.list);
  router.post('/:id/pages', pages.create);
  router.get('/:id/blobs', blobs.list);
  router.post('/:id/blobs', raw({ type: '*/*', limit: '12mb' }), blobs.upload);
  router.get('/:id/members', members.list);
  router.post('/:id/members', members.invite);
  router.delete('/:id/invites/:inviteId', members.revokeInvite);
  router.patch('/:id/members/:userId', members.setRole);
  router.delete('/:id/members/:userId', members.remove);
  router.get('/:id/crypto', crypto.getWorkspace);
  router.put('/:id/crypto/keys', crypto.putMemberKey);
  router.post('/:id/crypto/enable', crypto.enable);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.patch);

  return router;
}
