import { Router } from 'express';
import { healthRouter } from './health.routes';
import { createAuthRouter } from './auth.routes';
import { createWorkspaceRouter } from './workspace.routes';
import { createPageRouter } from './page.routes';
import { createBlobRouter } from './blob.routes';
import { createPublicRouter } from './public.routes';
import { createInviteRouter } from './invite.routes';
import { createAiRouter } from './ai.routes';
import { createAdminRouter } from './admin.routes';
import { createKanbanCardRouter, createKanbanColumnRouter, createNoteRouter, createNoteTagRouter } from './note.routes';
import type { AuthService } from '../services/AuthService';
import type { PageService } from '../services/PageService';
import type { BlobService } from '../services/BlobService';
import type { MemberService } from '../services/MemberService';
import type { ShareService } from '../services/ShareService';
import type { AiService } from '../services/AiService';
import type { CryptoService } from '../services/CryptoService';
import type { OAuthService } from '../services/OAuthService';
import type { McpTokenService } from '../services/McpTokenService';
import type { McpOAuthService } from '../services/McpOAuthService';
import type { SystemAdminAuthService } from '../services/SystemAdminAuthService';
import type { AdminService } from '../services/AdminService';
import type { NoteService } from '../services/NoteService';
import { createMcpSettingsRouter } from './mcpSettings.routes';
import { createMcpOAuthApproveRouter } from './mcpOAuth.routes';

export function createApiRouter(
  authService: AuthService,
  pageService: PageService,
  blobService: BlobService,
  memberService: MemberService,
  shareService: ShareService,
  aiService: AiService,
  cryptoService: CryptoService,
  oauthService: OAuthService,
  mcpTokenService: McpTokenService,
  mcpOAuthService: McpOAuthService,
  systemAdminAuthService: SystemAdminAuthService,
  adminService: AdminService,
  noteService: NoteService
): Router {
  const router = Router();
  router.use('/health', healthRouter);
  router.use('/auth', createAuthRouter(authService, cryptoService, oauthService));
  router.use('/workspaces', createWorkspaceRouter(authService, pageService, blobService, memberService, cryptoService, noteService, mcpTokenService));
  router.use('/pages', createPageRouter(pageService, shareService));
  router.use('/notes', createNoteRouter(noteService));
  router.use('/kanban-columns', createKanbanColumnRouter(noteService));
  router.use('/kanban-cards', createKanbanCardRouter(noteService));
  router.use('/note-tags', createNoteTagRouter(noteService));
  router.use('/blobs', createBlobRouter(blobService));
  router.use('/public', createPublicRouter(shareService, blobService));
  router.use('/invites', createInviteRouter(memberService));
  router.use('/ai', createAiRouter(aiService));
  router.use('/mcp', createMcpSettingsRouter(mcpTokenService));
  router.use('/mcp', createMcpOAuthApproveRouter(mcpOAuthService));
  router.use('/admin', createAdminRouter(systemAdminAuthService, adminService));
  return router;
}
