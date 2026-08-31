import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { refreshTokens, users, workspaceMembers, workspaces } from '../db/schemas';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { HttpError } from '../utils/HttpError';
import { canAdminMembers, canEdit } from '../authz/roles';

const BCRYPT_ROUNDS = 12;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Database = typeof db;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  email: string;
}

export interface PublicWorkspace {
  id: string;
  name: string;
  role: string;
  encrypted: boolean;
  mcpEnabled: boolean;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export class AuthService {
  constructor(private readonly database: Database) {}

  async register(emailRaw: string, password: string): Promise<{
    user: PublicUser;
    tokens: AuthTokens;
    workspace: PublicWorkspace;
  }> {
    const email = normalizeEmail(emailRaw);
    if (!email || !email.includes('@')) {
      throw new HttpError('A valid email is required', 400, 'INVALID_EMAIL');
    }
    if (password.length < 8) {
      throw new HttpError('Password must be at least 8 characters', 400, 'WEAK_PASSWORD');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
      const result = await this.database.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email, passwordHash })
          .returning({ id: users.id, email: users.email });

        const [workspace] = await tx
          .insert(workspaces)
          .values({ name: 'My workspace' })
          .returning({
            id: workspaces.id,
            name: workspaces.name,
            encrypted: workspaces.encrypted,
            mcpEnabled: workspaces.mcpEnabled,
          });

        await tx.insert(workspaceMembers).values({
          workspaceId: workspace.id,
          userId: user.id,
          role: 'owner',
        });

        return { user, workspace };
      });

      const tokens = await this.issueTokens(result.user.id);
      return {
        user: result.user,
        tokens,
        workspace: { ...result.workspace, role: 'owner' },
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError('Email already registered', 409, 'EMAIL_TAKEN');
      }
      throw error;
    }
  }

  async login(emailRaw: string, password: string): Promise<{
    user: PublicUser;
    tokens: AuthTokens;
  }> {
    const email = normalizeEmail(emailRaw);
    const [user] = await this.database
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      throw new HttpError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.passwordHash) {
      throw new HttpError('This account uses Google or GitHub to sign in', 401, 'OAUTH_ONLY');
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new HttpError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const tokens = await this.issueTokens(user.id);
    return { user: { id: user.id, email: user.email }, tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: { userId: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new HttpError('Invalid refresh token', 401, 'INVALID_REFRESH');
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const [row] = await this.database
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
      .limit(1);

    if (!row || row.userId !== payload.userId) {
      throw new HttpError('Invalid refresh token', 401, 'INVALID_REFRESH');
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new HttpError('Refresh token expired', 401, 'REFRESH_EXPIRED');
    }

    await this.database
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, row.id));

    return this.issueTokens(payload.userId);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    await this.database
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
  }

  async me(userId: string): Promise<PublicUser> {
    const [user] = await this.database
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new HttpError('User not found', 401, 'USER_NOT_FOUND');
    }
    return user;
  }

  async listWorkspaces(userId: string): Promise<PublicWorkspace[]> {
    const rows = await this.database
      .select({
        id: workspaces.id,
        name: workspaces.name,
        encrypted: workspaces.encrypted,
        mcpEnabled: workspaces.mcpEnabled,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, userId));

    return rows;
  }

  async createWorkspace(userId: string, nameRaw: string): Promise<PublicWorkspace> {
    const name = nameRaw.trim();
    if (!name) {
      throw new HttpError('Workspace name is required', 400, 'INVALID_NAME');
    }

    return this.database.transaction(async (tx) => {
      const [workspace] = await tx
        .insert(workspaces)
        .values({ name })
        .returning({
          id: workspaces.id,
          name: workspaces.name,
          encrypted: workspaces.encrypted,
          mcpEnabled: workspaces.mcpEnabled,
        });

      await tx.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId,
        role: 'owner',
      });

      return { ...workspace, role: 'owner' };
    });
  }

  async getWorkspace(userId: string, workspaceId: string): Promise<PublicWorkspace> {
    const [row] = await this.database
      .select({
        id: workspaces.id,
        name: workspaces.name,
        encrypted: workspaces.encrypted,
        mcpEnabled: workspaces.mcpEnabled,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.id, workspaceId)))
      .limit(1);

    if (!row) {
      const [exists] = await this.database
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      if (exists) {
        throw new HttpError('Forbidden', 403, 'FORBIDDEN');
      }
      throw new HttpError('Workspace not found', 404, 'WORKSPACE_NOT_FOUND');
    }
    return row;
  }

  async requireMember(userId: string, workspaceId: string): Promise<PublicWorkspace> {
    return this.getWorkspace(userId, workspaceId);
  }

  async requireEditor(userId: string, workspaceId: string): Promise<PublicWorkspace> {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!canEdit(workspace.role)) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN');
    }
    return workspace;
  }

  async requireWorkspaceOwner(userId: string, workspaceId: string): Promise<PublicWorkspace> {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!canAdminMembers(workspace.role)) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN');
    }
    return workspace;
  }

  async issueSession(userId: string): Promise<AuthTokens> {
    return this.issueTokens(userId);
  }

  private async issueTokens(userId: string): Promise<AuthTokens> {
    const accessToken = signAccessToken({ userId });
    const refreshToken = signRefreshToken(userId);
    await this.database.insert(refreshTokens).values({
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    return { accessToken, refreshToken };
  }
}
