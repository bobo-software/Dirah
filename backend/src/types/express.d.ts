import type { JwtPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      systemAdmin?: { adminId: string };
      mcpAuth?: {
        userId: string;
        tokenId: string | null;
        workspaceScope: 'selected' | 'all' | 'all_read_only';
        defaultWorkspaceId: string | null;
      };
      startTime?: number;
    }
  }
}

export {};
