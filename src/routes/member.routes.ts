import { Router } from 'express';
import { createMemberController } from '../controllers/member.controller';
import { requireAuth } from '../middlewares/auth';
import type { MemberService } from '../services/MemberService';

/** Per-person views across workspaces, e.g. which of my workspaces a member can see. */
export function createMemberRouter(memberService: MemberService): Router {
  const router = Router();
  const members = createMemberController(memberService);
  router.use(requireAuth);
  router.get('/:userId/workspaces', members.memberWorkspaces);
  router.put('/:userId/workspaces', members.setMemberWorkspaces);
  return router;
}
