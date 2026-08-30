import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, count, eq, isNull } from 'drizzle-orm';
import { users, workspaceInvites, workspaceMemberKeys, workspaceMembers, workspaces } from '../db/schemas';
import { HttpError } from '../utils/HttpError';
import { isMemberRole, isWorkspaceRole } from '../authz/roles';
import { env } from '../config/env';
import { sendInviteEmail } from '../mail/inviteMailer';
import { type AuthService, type AuthTokens, type Database, type PublicUser, type PublicWorkspace } from './AuthService';

const BCRYPT_ROUNDS = 12;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PublicMember {
  userId: string;
  email: string;
  role: string;
}

export interface PublicInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  inviteUrl: string;
}

export interface InvitePreview {
  email: string;
  workspaceName: string;
  role: string;
  expiresAt: string;
}

export type InviteOutcome =
  | { kind: 'member'; member: PublicMember }
  | { kind: 'pending'; invite: PublicInvite & { mailed: boolean } };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function inviteUrlFor(token: string): string {
  return `${env.appPublicUrl}/invite/${token}`;
}

function toPublicInvite(row: {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: Date;
}): PublicInvite {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expiresAt.toISOString(),
    inviteUrl: inviteUrlFor(row.token),
  };
}

export class MemberService {
  constructor(
    private readonly database: Database,
    private readonly auth: AuthService
  ) {}

  async list(
    userId: string,
    workspaceId: string
  ): Promise<{ members: PublicMember[]; invites: PublicInvite[] }> {
    await this.auth.requireMember(userId, workspaceId);
    const members = await this.database
      .select({
        userId: workspaceMembers.userId,
        email: users.email,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId));
    const inviteRows = await this.database
      .select({
        id: workspaceInvites.id,
        email: workspaceInvites.email,
        role: workspaceInvites.role,
        token: workspaceInvites.token,
        expiresAt: workspaceInvites.expiresAt,
      })
      .from(workspaceInvites)
      .where(
        and(eq(workspaceInvites.workspaceId, workspaceId), isNull(workspaceInvites.acceptedAt))
      );
    return { members, invites: inviteRows.map(toPublicInvite) };
  }

  async invite(
    userId: string,
    workspaceId: string,
    emailRaw: string,
    roleRaw: string
  ): Promise<InviteOutcome> {
    const workspace = await this.auth.requireWorkspaceOwner(userId, workspaceId);
    if (!isMemberRole(roleRaw)) {
      throw new HttpError('Role must be editor or viewer', 400, 'INVALID_ROLE');
    }
    const email = normalizeEmail(emailRaw);
    if (!email || !email.includes('@')) {
      throw new HttpError('A valid email is required', 400, 'INVALID_EMAIL');
    }
    const [user] = await this.database
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (user) {
      await this.database
        .delete(workspaceInvites)
        .where(
          and(
            eq(workspaceInvites.workspaceId, workspaceId),
            eq(workspaceInvites.email, email),
            isNull(workspaceInvites.acceptedAt)
          )
        );
      const [existing] = await this.database
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id))
        )
        .limit(1);
      if (existing) {
        throw new HttpError('Already a member', 409, 'ALREADY_MEMBER');
      }
      await this.database.insert(workspaceMembers).values({
        workspaceId,
        userId: user.id,
        role: roleRaw,
      });
      return { kind: 'member', member: { userId: user.id, email: user.email, role: roleRaw } };
    }

    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const [pending] = await this.database
      .select({ id: workspaceInvites.id })
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.workspaceId, workspaceId),
          eq(workspaceInvites.email, email),
          isNull(workspaceInvites.acceptedAt)
        )
      )
      .limit(1);

    let inviteId: string;
    if (pending) {
      await this.database
        .update(workspaceInvites)
        .set({ token, role: roleRaw, invitedBy: userId, expiresAt })
        .where(eq(workspaceInvites.id, pending.id));
      inviteId = pending.id;
    } else {
      const [created] = await this.database
        .insert(workspaceInvites)
        .values({
          workspaceId,
          email,
          role: roleRaw,
          token,
          invitedBy: userId,
          expiresAt,
        })
        .returning({ id: workspaceInvites.id });
      inviteId = created.id;
    }

    const mailed = await sendInviteEmail({
      to: email,
      workspaceName: workspace.name,
      role: roleRaw,
      inviteUrl: inviteUrlFor(token),
    });
    return {
      kind: 'pending',
      invite: {
        id: inviteId,
        email,
        role: roleRaw,
        expiresAt: expiresAt.toISOString(),
        inviteUrl: inviteUrlFor(token),
        mailed,
      },
    };
  }

  async revokeInvite(actorId: string, workspaceId: string, inviteId: string): Promise<void> {
    await this.auth.requireWorkspaceOwner(actorId, workspaceId);
    const deleted = await this.database
      .delete(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.id, inviteId),
          eq(workspaceInvites.workspaceId, workspaceId),
          isNull(workspaceInvites.acceptedAt)
        )
      )
      .returning({ id: workspaceInvites.id });
    if (deleted.length === 0) {
      throw new HttpError('Invite not found', 404, 'INVITE_NOT_FOUND');
    }
  }

  async preview(token: string): Promise<InvitePreview> {
    const invite = await this.requireOpenInvite(token);
    return {
      email: invite.email,
      workspaceName: invite.workspaceName,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async accept(
    token: string,
    password: string
  ): Promise<{ user: PublicUser; tokens: AuthTokens; workspace: PublicWorkspace }> {
    if (password.length < 8) {
      throw new HttpError('Password must be at least 8 characters', 400, 'WEAK_PASSWORD');
    }
    const invite = await this.requireOpenInvite(token);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
      const result = await this.database.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email: invite.email, passwordHash })
          .returning({ id: users.id, email: users.email });
        await tx.insert(workspaceMembers).values({
          workspaceId: invite.workspaceId,
          userId: user.id,
          role: invite.role,
        });
        await tx
          .update(workspaceInvites)
          .set({ acceptedAt: new Date() })
          .where(eq(workspaceInvites.id, invite.id));
        return {
          user,
          workspace: {
            id: invite.workspaceId,
            name: invite.workspaceName,
            encrypted: invite.encrypted,
            role: invite.role,
          },
        };
      });
      const tokens = await this.auth.issueSession(result.user.id);
      return { user: result.user, tokens, workspace: result.workspace };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(
          'Email already registered. Sign in, then ask the owner to invite you again.',
          409,
          'EMAIL_TAKEN'
        );
      }
      throw error;
    }
  }

  private async requireOpenInvite(token: string): Promise<{
    id: string;
    workspaceId: string;
    workspaceName: string;
    encrypted: boolean;
    email: string;
    role: string;
    expiresAt: Date;
  }> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new HttpError('Invite not found', 404, 'INVITE_NOT_FOUND');
    }
    const [row] = await this.database
      .select({
        id: workspaceInvites.id,
        workspaceId: workspaceInvites.workspaceId,
        workspaceName: workspaces.name,
        encrypted: workspaces.encrypted,
        email: workspaceInvites.email,
        role: workspaceInvites.role,
        expiresAt: workspaceInvites.expiresAt,
        acceptedAt: workspaceInvites.acceptedAt,
      })
      .from(workspaceInvites)
      .innerJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
      .where(eq(workspaceInvites.token, trimmed))
      .limit(1);
    if (!row || row.acceptedAt || row.expiresAt.getTime() <= Date.now()) {
      throw new HttpError('Invite not found', 404, 'INVITE_NOT_FOUND');
    }
    return row;
  }

  async setRole(
    actorId: string,
    workspaceId: string,
    targetUserId: string,
    roleRaw: string
  ): Promise<PublicMember> {
    await this.auth.requireWorkspaceOwner(actorId, workspaceId);
    if (!isWorkspaceRole(roleRaw)) {
      throw new HttpError('Role must be owner, editor, or viewer', 400, 'INVALID_ROLE');
    }
    const member = await this.requireMemberRow(workspaceId, targetUserId);
    if (member.role === 'owner' && roleRaw !== 'owner') {
      await this.assertNotLastOwner(workspaceId);
    }
    const [updated] = await this.database
      .update(workspaceMembers)
      .set({ role: roleRaw })
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, targetUserId)
        )
      )
      .returning({
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
      });
    const [user] = await this.database
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, updated.userId))
      .limit(1);
    return { userId: updated.userId, email: user.email, role: updated.role };
  }

  async remove(actorId: string, workspaceId: string, targetUserId: string): Promise<void> {
    await this.auth.requireWorkspaceOwner(actorId, workspaceId);
    const member = await this.requireMemberRow(workspaceId, targetUserId);
    if (member.role === 'owner') {
      await this.assertNotLastOwner(workspaceId);
    }
    await this.database
      .delete(workspaceMemberKeys)
      .where(
        and(
          eq(workspaceMemberKeys.workspaceId, workspaceId),
          eq(workspaceMemberKeys.userId, targetUserId)
        )
      );
    await this.database
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, targetUserId)
        )
      );
  }

  private async requireMemberRow(
    workspaceId: string,
    targetUserId: string
  ): Promise<{ userId: string; role: string }> {
    const [member] = await this.database
      .select({
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, targetUserId)
        )
      )
      .limit(1);
    if (!member) {
      throw new HttpError('Member not found', 404, 'MEMBER_NOT_FOUND');
    }
    return member;
  }

  private async assertNotLastOwner(workspaceId: string): Promise<void> {
    const [{ n }] = await this.database
      .select({ n: count() })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'owner'))
      );
    if (Number(n) <= 1) {
      throw new HttpError('Cannot remove the last owner', 400, 'LAST_OWNER');
    }
  }
}
