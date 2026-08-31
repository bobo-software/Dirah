import type { JwtPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      mcpAuth?: { userId: string; tokenId: string | null; defaultWorkspaceId: string | null };
    }
  }
}

export {};
