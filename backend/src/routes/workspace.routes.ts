import { Router, raw } from 'express';
import { createWorkspaceController } from '../controllers/workspace.controller';
import { createPageController } from '../controllers/page.controller';
import { createBlobController } from '../controllers/blob.controller';
import { createMemberController } from '../controllers/member.controller';
import { createCryptoController } from '../controllers/crypto.controller';
import { createNoteController } from '../controllers/note.controller';
import { createTaskController } from '../controllers/task.controller';
import { createTicketController } from '../controllers/ticket.controller';
import type { AuthService } from '../services/AuthService';
import type { PageService } from '../services/PageService';
import type { BlobService } from '../services/BlobService';
import type { MemberService } from '../services/MemberService';
import type { CryptoService } from '../services/CryptoService';
import type { McpTokenService } from '../services/McpTokenService';
import type { NoteService } from '../services/NoteService';
import type { TaskListService } from '../services/TaskListService';
import type { TicketService } from '../services/TicketService';
import { requireAuth } from '../middlewares/auth';

export function createWorkspaceRouter(
  authService: AuthService,
  pageService: PageService,
  blobService: BlobService,
  memberService: MemberService,
  cryptoService: CryptoService,
  noteService: NoteService,
  taskListService: TaskListService,
  ticketService: TicketService,
  mcpTokenService?: McpTokenService
): Router {
  const router = Router();
  const controller = createWorkspaceController(authService, mcpTokenService);
  const pages = createPageController(pageService);
  const blobs = createBlobController(blobService);
  const members = createMemberController(memberService);
  const crypto = createCryptoController(cryptoService);
  const notes = createNoteController(noteService);
  const tasks = createTaskController(taskListService);
  const tickets = createTicketController(ticketService);

  router.use(requireAuth);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id/pages', pages.list);
  router.post('/:id/pages', pages.create);
  router.get('/:id/notes', notes.list);
  router.post('/:id/notes', notes.create);
  router.get('/:id/note-tags', notes.listTags);
  router.post('/:id/note-tags', notes.createTag);
  router.get('/:id/task-lists', tasks.list);
  router.post('/:id/task-lists', tasks.create);
  router.get('/:id/ticket-boards', tickets.listBoards);
  router.post('/:id/ticket-boards', tickets.createBoard);
  router.get('/:id/tickets', tickets.search);
  router.get('/:id/tickets/by-key/:key', tickets.getByKey);
  router.get('/:id/blobs', blobs.list);
  router.get('/:id/blobs/:blobId', blobs.downloadInWorkspace);
  router.post('/:id/blobs', raw({ type: '*/*', limit: '12mb' }), blobs.upload);
  router.get('/:id/members', members.list);
  router.post('/:id/members', members.invite);
  router.delete('/:id/invites/:inviteId', members.revokeInvite);
  router.patch('/:id/members/:userId', members.setRole);
  router.delete('/:id/members/:userId', members.remove);
  router.get('/:id/crypto', crypto.getWorkspace);
  router.post('/:id/crypto/enable', crypto.enable);
  router.put('/:id/crypto/keys', crypto.putMemberKey);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.patch);
  router.delete('/:id', controller.remove);

  return router;
}
