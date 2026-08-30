import { and, eq } from 'drizzle-orm';
import { userCrypto, workspaceMemberKeys, workspaceMembers, workspaces } from '../db/schemas';
import { HttpError } from '../utils/HttpError';
import { type AuthService, type Database } from './AuthService';

export type UserCryptoBundle = {
  publicKey: string;
  wrappedPrivateKey: string;
  kdfSalt: string;
  kdfIterations: number;
};

export type WorkspaceCryptoView = {
  encrypted: boolean;
  wrappedDek: string | null;
  members: Array<{ userId: string; publicKey: string | null; hasDek: boolean }>;
};

export class CryptoService {
  constructor(
    private readonly database: Database,
    private readonly auth: AuthService
  ) {}

  async getUserBundle(userId: string): Promise<UserCryptoBundle | null> {
    const [row] = await this.database
      .select({
        publicKey: userCrypto.publicKey,
        wrappedPrivateKey: userCrypto.wrappedPrivateKey,
        kdfSalt: userCrypto.kdfSalt,
        kdfIterations: userCrypto.kdfIterations,
      })
      .from(userCrypto)
      .where(eq(userCrypto.userId, userId))
      .limit(1);
    return row ?? null;
  }

  async putUserBundle(userId: string, bundle: UserCryptoBundle): Promise<void> {
    if (!bundle.publicKey.trim() || !bundle.wrappedPrivateKey.trim() || !bundle.kdfSalt.trim()) {
      throw new HttpError('Invalid crypto bundle', 400, 'INVALID_CRYPTO');
    }
    if (!Number.isFinite(bundle.kdfIterations) || bundle.kdfIterations < 1000) {
      throw new HttpError('Invalid KDF iterations', 400, 'INVALID_CRYPTO');
    }
    await this.database
      .insert(userCrypto)
      .values({
        userId,
        publicKey: bundle.publicKey,
        wrappedPrivateKey: bundle.wrappedPrivateKey,
        kdfSalt: bundle.kdfSalt,
        kdfIterations: bundle.kdfIterations,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userCrypto.userId,
        set: {
          publicKey: bundle.publicKey,
          wrappedPrivateKey: bundle.wrappedPrivateKey,
          kdfSalt: bundle.kdfSalt,
          kdfIterations: bundle.kdfIterations,
          updatedAt: new Date(),
        },
      });
  }

  async getWorkspaceCrypto(userId: string, workspaceId: string): Promise<WorkspaceCryptoView> {
    const workspace = await this.auth.requireMember(userId, workspaceId);
    const members = await this.database
      .select({
        userId: workspaceMemberKeys.userId,
        wrappedDek: workspaceMemberKeys.wrappedDek,
      })
      .from(workspaceMemberKeys)
      .where(eq(workspaceMemberKeys.workspaceId, workspaceId));
    const dekByUser = new Map(members.map((row) => [row.userId, row.wrappedDek]));

    const roster = await this.database
      .select({
        userId: workspaceMembers.userId,
        publicKey: userCrypto.publicKey,
      })
      .from(workspaceMembers)
      .leftJoin(userCrypto, eq(userCrypto.userId, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId));

    return {
      encrypted: workspace.encrypted,
      wrappedDek: dekByUser.get(userId) ?? null,
      members: roster.map((row) => ({
        userId: row.userId,
        publicKey: row.publicKey,
        hasDek: dekByUser.has(row.userId),
      })),
    };
  }

  async putMemberDek(
    actorId: string,
    workspaceId: string,
    targetUserId: string,
    wrappedDek: string
  ): Promise<void> {
    await this.auth.requireMember(actorId, workspaceId);
    if (!wrappedDek.trim()) {
      throw new HttpError('wrappedDek is required', 400, 'INVALID_CRYPTO');
    }
    const [member] = await this.database
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId))
      )
      .limit(1);
    if (!member) {
      throw new HttpError('Member not found', 404, 'MEMBER_NOT_FOUND');
    }
    await this.database
      .insert(workspaceMemberKeys)
      .values({ workspaceId, userId: targetUserId, wrappedDek })
      .onConflictDoUpdate({
        target: [workspaceMemberKeys.workspaceId, workspaceMemberKeys.userId],
        set: { wrappedDek },
      });
  }

  async enable(userId: string, workspaceId: string): Promise<{ encrypted: boolean }> {
    await this.auth.requireWorkspaceOwner(userId, workspaceId);
    const [mine] = await this.database
      .select({ wrappedDek: workspaceMemberKeys.wrappedDek })
      .from(workspaceMemberKeys)
      .where(
        and(eq(workspaceMemberKeys.workspaceId, workspaceId), eq(workspaceMemberKeys.userId, userId))
      )
      .limit(1);
    if (!mine) {
      throw new HttpError('Upload a wrapped workspace key first', 400, 'DEK_REQUIRED');
    }
    await this.database
      .update(workspaces)
      .set({ encrypted: true, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));
    return { encrypted: true };
  }

  async isWorkspaceEncrypted(workspaceId: string): Promise<boolean> {
    const [row] = await this.database
      .select({ encrypted: workspaces.encrypted })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    return Boolean(row?.encrypted);
  }

  async deleteMemberDek(workspaceId: string, userId: string): Promise<void> {
    await this.database
      .delete(workspaceMemberKeys)
      .where(
        and(eq(workspaceMemberKeys.workspaceId, workspaceId), eq(workspaceMemberKeys.userId, userId))
      );
  }
}
