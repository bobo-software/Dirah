import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, isNotNull, isNull, lt, ne } from 'drizzle-orm';
import { db } from '../db';
import { refreshTokens, userCrypto, users, workspaceMembers, workspaces } from '../db/schemas';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { HttpError } from '../utils/HttpError';
import { canAdminMembers, canEdit, isOwner } from '../authz/roles';

const BCRYPT_ROUNDS = 12;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A deleted workspace stays recoverable in the database this long before it is purged. */
export const WORKSPACE_PURGE_AFTER_MS = 48 * 60 * 60 * 1000;

export type Database = typeof db;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  about: string | null;
  hasPassword?: boolean;
}

export interface ProfileUpdate {
  name?: string | null;
  role?: string | null;
  about?: string | null;
  email?: string;
  currentPassword?: string;
}

export interface RewrappedCrypto {
  publicKey: string;
  wrappedPrivateKey: string;
  kdfSalt: string;
  kdfIterations: number;
}

export interface PublicWorkspace {
  id: string;
  name: string;
  description: string | null;
  role: string;
  encrypted: boolean;
  mcpEnabled: boolean;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function optionalProfileText(
  value: string | null | undefined,
  max: number,
  label: string
): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new HttpError(`${label} must be ${max} characters or fewer`, 400, 'INVALID_PROFILE');
  }
  return trimmed;
}

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export class AuthService {
  constructor(private readonly database: Database) {}

  async register(emailRaw: string, password: string, nameRaw?: string): Promise<{
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

    const name = nameRaw?.trim() || null;
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
      const result = await this.database.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email, passwordHash, name })
          .returning({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            about: users.about,
          });

        const [workspace] = await tx
          .insert(workspaces)
          .values({ name: 'My workspace' })
          .returning({
            id: workspaces.id,
            name: workspaces.name,
            description: workspaces.description,
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
        name: users.name,
        role: users.role,
        about: users.about,
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
    return { user: this.toPublicUser(user), tokens };
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
    const user = await this.requireUser(userId);
    return this.toPublicUser(user);
  }

  async updateProfile(userId: string, input: ProfileUpdate): Promise<PublicUser> {
    const name = optionalProfileText(input.name, 80, 'Name');
    const role = optionalProfileText(input.role, 80, 'Role');
    const about = optionalProfileText(input.about, 280, 'About');
    const user = await this.requireUser(userId);

    let email = user.email;
    if (input.email !== undefined) {
      email = normalizeEmail(input.email);
      if (!email || !email.includes('@')) {
        throw new HttpError('A valid email is required', 400, 'INVALID_EMAIL');
      }
      if (email !== user.email) {
        await this.assertCurrentPassword(user.passwordHash, input.currentPassword);
      }
    }

    const patch: {
      email?: string;
      name?: string | null;
      role?: string | null;
      about?: string | null;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (email !== user.email) patch.email = email;
    if (name !== undefined && name !== user.name) patch.name = name;
    if (role !== undefined && role !== user.role) patch.role = role;
    if (about !== undefined && about !== user.about) patch.about = about;
    if (Object.keys(patch).length === 1) {
      return this.toPublicUser(user);
    }

    try {
      const [updated] = await this.database
        .update(users)
        .set(patch)
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          about: users.about,
          passwordHash: users.passwordHash,
        });
      if (!updated) {
        throw new HttpError('User not found', 401, 'USER_NOT_FOUND');
      }
      return this.toPublicUser(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError('Email already registered', 409, 'EMAIL_TAKEN');
      }
      throw error;
    }
  }

  async changePassword(
    userId: string,
    newPassword: string,
    currentPassword: string | undefined,
    cryptoBundle: RewrappedCrypto | undefined,
    keepRefreshToken?: string
  ): Promise<PublicUser> {
    if (newPassword.length < 8) {
      throw new HttpError('Password must be at least 8 characters', 400, 'WEAK_PASSWORD');
    }
    const user = await this.requireUser(userId);
    await this.assertCurrentPassword(user.passwordHash, currentPassword);
    if (user.passwordHash && (await bcrypt.compare(newPassword, user.passwordHash))) {
      throw new HttpError('Choose a different password', 400, 'PASSWORD_UNCHANGED');
    }

    const [existingCrypto] = await this.database
      .select({ publicKey: userCrypto.publicKey })
      .from(userCrypto)
      .where(eq(userCrypto.userId, userId))
      .limit(1);
    if (existingCrypto) {
      if (!cryptoBundle) {
        throw new HttpError(
          'Changing your password must also re-wrap your encryption key',
          400,
          'CRYPTO_REWRAP_REQUIRED'
        );
      }
      if (cryptoBundle.publicKey !== existingCrypto.publicKey) {
        throw new HttpError('Encryption key does not match this account', 400, 'CRYPTO_KEY_MISMATCH');
      }
    } else if (cryptoBundle) {
      throw new HttpError('This account has no encryption key to update', 400, 'CRYPTO_NOT_FOUND');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const now = new Date();
    const keepHash = keepRefreshToken ? hashRefreshToken(keepRefreshToken) : null;

    await this.database.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, userId));
      if (existingCrypto && cryptoBundle) {
        await tx
          .update(userCrypto)
          .set({
            wrappedPrivateKey: cryptoBundle.wrappedPrivateKey,
            kdfSalt: cryptoBundle.kdfSalt,
            kdfIterations: cryptoBundle.kdfIterations,
            updatedAt: now,
          })
          .where(eq(userCrypto.userId, userId));
      }
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(
          and(
            eq(refreshTokens.userId, userId),
            isNull(refreshTokens.revokedAt),
            keepHash ? ne(refreshTokens.tokenHash, keepHash) : undefined
          )
        );
    });

    return this.toPublicUser({ ...user, passwordHash: 'set' });
  }

  private async requireUser(userId: string): Promise<{
    id: string;
    email: string;
    name: string | null;
    role: string | null;
    about: string | null;
    passwordHash: string | null;
  }> {
    const [user] = await this.database
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        about: users.about,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      throw new HttpError('User not found', 401, 'USER_NOT_FOUND');
    }
    return user;
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    name: string | null;
    role: string | null;
    about: string | null;
    passwordHash: string | null;
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      about: user.about,
      hasPassword: Boolean(user.passwordHash),
    };
  }

  private async assertCurrentPassword(passwordHash: string | null, currentPassword?: string): Promise<void> {
    if (!passwordHash) return;
    if (!currentPassword) {
      throw new HttpError('Current password is required', 400, 'PASSWORD_REQUIRED');
    }
    const matches = await bcrypt.compare(currentPassword, passwordHash);
    if (!matches) {
      throw new HttpError('Current password is incorrect', 401, 'INVALID_CREDENTIALS');
    }
  }

  async listWorkspaces(userId: string): Promise<PublicWorkspace[]> {
    const rows = await this.database
      .select({
        id: workspaces.id,
        name: workspaces.name,
        description: workspaces.description,
        encrypted: workspaces.encrypted,
        mcpEnabled: workspaces.mcpEnabled,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(
        and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.hidden, false), isNull(workspaces.deletedAt))
      );

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
          description: workspaces.description,
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
        description: workspaces.description,
        encrypted: workspaces.encrypted,
        mcpEnabled: workspaces.mcpEnabled,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          eq(workspaces.id, workspaceId),
          // A hidden member gets the same 403 as a non-member.
          eq(workspaceMembers.hidden, false),
          isNull(workspaces.deletedAt)
        )
      )
      .limit(1);

    if (!row) {
      const [exists] = await this.database
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)))
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

  async requireMemberAdmin(userId: string, workspaceId: string): Promise<PublicWorkspace> {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!canAdminMembers(workspace.role)) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN');
    }
    return workspace;
  }

  async requireWorkspaceOwner(userId: string, workspaceId: string): Promise<PublicWorkspace> {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!isOwner(workspace.role)) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN');
    }
    return workspace;
  }

  async renameWorkspace(userId: string, workspaceId: string, nameRaw: string): Promise<PublicWorkspace> {
    await this.requireWorkspaceOwner(userId, workspaceId);
    const name = nameRaw.trim();
    if (!name) {
      throw new HttpError('Workspace name is required', 400, 'INVALID_NAME');
    }
    await this.database
      .update(workspaces)
      .set({ name, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));
    return this.getWorkspace(userId, workspaceId);
  }

  async updateWorkspaceDescription(
    userId: string,
    workspaceId: string,
    descriptionRaw: string | null
  ): Promise<PublicWorkspace> {
    await this.requireWorkspaceOwner(userId, workspaceId);
    const description = descriptionRaw === null ? null : descriptionRaw.trim() || null;
    await this.database
      .update(workspaces)
      .set({ description, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));
    return this.getWorkspace(userId, workspaceId);
  }

  /**
   * Hides the workspace from everyone at once; purgeDeletedWorkspaces removes it for good
   * after WORKSPACE_PURGE_AFTER_MS. The owner must type the workspace name to confirm.
   */
  async deleteWorkspace(userId: string, workspaceId: string, confirmName: string): Promise<{ purgeAt: Date }> {
    const workspace = await this.requireWorkspaceOwner(userId, workspaceId);
    if (confirmName.trim() !== workspace.name.trim()) {
      throw new HttpError('Type the workspace name to confirm', 400, 'NAME_MISMATCH');
    }
    const deletedAt = new Date();
    await this.database
      .update(workspaces)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)));
    return { purgeAt: new Date(deletedAt.getTime() + WORKSPACE_PURGE_AFTER_MS) };
  }

  /** Permanently deletes workspaces deleted before the purge window; their content cascades. */
  async purgeDeletedWorkspaces(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - WORKSPACE_PURGE_AFTER_MS);
    const purged = await this.database
      .delete(workspaces)
      .where(and(isNotNull(workspaces.deletedAt), lt(workspaces.deletedAt, cutoff)))
      .returning({ id: workspaces.id });
    return purged.length;
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
