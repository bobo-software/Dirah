import { Router } from 'express';
import { createMemberController } from '../controllers/member.controller';
import type { MemberService } from '../services/MemberService';

export function createInviteRouter(memberService: MemberService): Router {
  const router = Router();
  const members = createMemberController(memberService);
  router.get('/:token', members.preview);
  router.post('/:token/accept', members.accept);
  return router;
}
