import { Router } from 'express';
import { createMemberController } from '../controllers/member.controller';
import type { MemberService } from '../services/MemberService';
import { verifyAccessToken } from '../utils/jwt';
import type { Request, Response, NextFunction } from 'express';

/** Attach user when a Bearer token is present; do not fail when missing. */
function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = verifyAccessToken(header.slice('Bearer '.length).trim());
    } catch {
      // ignore invalid token; unauthenticated accept path may still apply
    }
  }
  next();
}

export function createInviteRouter(memberService: MemberService): Router {
  const router = Router();
  const members = createMemberController(memberService);
  router.get('/:token', members.preview);
  router.post('/:token/accept', optionalAuth, members.accept);
  return router;
}
