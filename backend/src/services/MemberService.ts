import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { users, workspaceInvites, workspaceMemberKeys, workspaceMembers, workspaces } from '../db/schemas';
import { HttpError } from '../utils/HttpError';
import { canAdminMembers, isMemberRole, isOwner, isWorkspaceRole } from '../authz/roles';
import { env } from '../config/env';
import { sendInviteEmail } from '../mail/inviteMailer';
import { type AuthService, type AuthTokens, type Database, type PublicUser, type PublicWorkspace } from './AuthService';

const BCRYPT_ROUNDS = 12;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PublicMember {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  /** Hidden members keep their role but cannot see or open the workspace. */
  hidden: boolean;
}

/** One of the target member's workspaces, as seen by an owner/admin of it. */
export interface MemberWorkspace {
  workspaceId: string;
  name: string;
  role: string;
  hidden: boolean;
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
  invitedByEmail: string;
  accountExists: boolean;
}

export interface OpenInvite {
  id: string;
  workspaceId: string;
  workspaceName: string;
  workspaceDescription: string | null;
  encrypted: boolean;
  mcpEnabled: boolean;
  email: string;
  role: string;
  expiresAt: Date;
  invitedByEmail: string;
}

export type InviteOutcome = { kind: 'pending'; invite: PublicInvite & { mailed: boolean } };

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
        name: users.name,
        role: workspaceMembers.role,
        hidden: workspaceMembers.hidden,
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
    const workspace = await this.auth.requireMemberAdmin(userId, workspaceId);
    if (!isMemberRole(roleRaw)) {
      throw new HttpError('Role must be admin, editor, or viewer', 400, 'INVALID_ROLE');
    }
    const email = normalizeEmail(emailRaw);
    if (!email || !email.includes('@')) {
      throw new HttpError('A valid email is required', 400, 'INVALID_EMAIL');
    }

    const [inviter] = await this.database
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!inviter) {
      throw new HttpError('User not found', 401, 'USER_NOT_FOUND');
    }

    const [existingUser] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existingUser) {
      const [existingMember] = await this.database
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, existingUser.id)
          )
        )
        .limit(1);
      if (existingMember) {
        throw new HttpError('Already a member', 409, 'ALREADY_MEMBER');
      }
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
      invitedByEmail: inviter.email,
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
    await this.auth.requireMemberAdmin(actorId, workspaceId);
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
    const [existing] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invite.email))
      .limit(1);
    return {
      email: invite.email,
      workspaceName: invite.workspaceName,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      invitedByEmail: invite.invitedByEmail,
      accountExists: Boolean(existing),
    };
  }

  async accept(
    token: string,
    password: string,
    nameRaw?: string
  ): Promise<{ user: PublicUser; tokens: AuthTokens; workspace: PublicWorkspace }> {
    if (password.length < 8) {
      throw new HttpError('Password must be at least 8 characters', 400, 'WEAK_PASSWORD');
    }
    const invite = await this.requireOpenInvite(token);
    const [existing] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invite.email))
      .limit(1);
    if (existing) {
      throw new HttpError(
        'Email already registered. Sign in to accept this invite.',
        409,
        'EMAIL_TAKEN'
      );
    }
    const name = nameRaw?.trim() || null;
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
      const result = await this.database.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email: invite.email, passwordHash, name })
          .returning({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            about: users.about,
          });
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
            description: invite.workspaceDescription,
            encrypted: invite.encrypted,
            mcpEnabled: invite.mcpEnabled ?? true,
            role: invite.role,
          },
        };
      });
      const tokens = await this.auth.issueSession(result.user.id);
      return { user: result.user, tokens, workspace: result.workspace };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(
          'Email already registered. Sign in to accept this invite.',
          409,
          'EMAIL_TAKEN'
        );
      }
      throw error;
    }
  }

  async acceptAsUser(
    token: string,
    userId: string
  ): Promise<{ user: PublicUser; workspace: PublicWorkspace }> {
    const invite = await this.requireOpenInvite(token);
    const [user] = await this.database
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        about: users.about,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      throw new HttpError('User not found', 401, 'USER_NOT_FOUND');
    }
    if (normalizeEmail(user.email) !== invite.email) {
      throw new HttpError(
        'Signed-in account does not match this invite. Sign out and use the invited email.',
        403,
        'INVITE_EMAIL_MISMATCH'
      );
    }

    const [existingMember] = await this.database
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, invite.workspaceId), eq(workspaceMembers.userId, user.id))
      )
      .limit(1);
    if (existingMember) {
      await this.database
        .update(workspaceInvites)
        .set({ acceptedAt: new Date() })
        .where(eq(workspaceInvites.id, invite.id));
      return {
        user,
        workspace: {
          id: invite.workspaceId,
          name: invite.workspaceName,
          description: invite.workspaceDescription,
          encrypted: invite.encrypted,
          mcpEnabled: invite.mcpEnabled ?? true,
          role: invite.role,
        },
      };
    }

    await this.database.transaction(async (tx) => {
      await tx.insert(workspaceMembers).values({
        workspaceId: invite.workspaceId,
        userId: user.id,
        role: invite.role,
      });
      await tx
        .update(workspaceInvites)
        .set({ acceptedAt: new Date() })
        .where(eq(workspaceInvites.id, invite.id));
    });

    return {
      user,
      workspace: {
        id: invite.workspaceId,
        name: invite.workspaceName,
        description: invite.workspaceDescription,
        encrypted: invite.encrypted,
        mcpEnabled: invite.mcpEnabled ?? true,
        role: invite.role,
      },
    };
  }

  /** The open invite for this token, or null when it is unknown, expired, or used. */
  async findOpenInvite(token: string): Promise<OpenInvite | null> {
    try {
      return await this.requireOpenInvite(token);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return null;
      throw error;
    }
  }

  private async requireOpenInvite(token: string): Promise<OpenInvite> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new HttpError('Invite not found', 404, 'INVITE_NOT_FOUND');
    }
    const inviter = alias(users, 'inviter');
    const [row] = await this.database
      .select({
        id: workspaceInvites.id,
        workspaceId: workspaceInvites.workspaceId,
        workspaceName: workspaces.name,
        workspaceDescription: workspaces.description,
        encrypted: workspaces.encrypted,
        mcpEnabled: workspaces.mcpEnabled,
        email: workspaceInvites.email,
        role: workspaceInvites.role,
        expiresAt: workspaceInvites.expiresAt,
        acceptedAt: workspaceInvites.acceptedAt,
        invitedByEmail: inviter.email,
      })
      .from(workspaceInvites)
      .innerJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
      .innerJoin(inviter, eq(inviter.id, workspaceInvites.invitedBy))
      .where(and(eq(workspaceInvites.token, trimmed), isNull(workspaces.deletedAt)))
      .limit(1);
    if (!row || row.acceptedAt || row.expiresAt.getTime() <= Date.now()) {
      throw new HttpError('Invite not found', 404, 'INVITE_NOT_FOUND');
    }
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName,
      workspaceDescription: row.workspaceDescription,
      encrypted: row.encrypted,
      mcpEnabled: row.mcpEnabled,
      email: row.email,
      role: row.role,
      expiresAt: row.expiresAt,
      invitedByEmail: row.invitedByEmail,
    };
  }

  async setRole(
    actorId: string,
    workspaceId: string,
    targetUserId: string,
    roleRaw: string
  ): Promise<PublicMember> {
    const actor = await this.auth.requireMemberAdmin(actorId, workspaceId);
    if (!isWorkspaceRole(roleRaw)) {
      throw new HttpError('Role must be owner, admin, editor, or viewer', 400, 'INVALID_ROLE');
    }
    const member = await this.requireMemberRow(workspaceId, targetUserId);
    if (!isOwner(actor.role) && (isOwner(member.role) || isOwner(roleRaw))) {
      throw new HttpError('Only an owner can change owner roles', 403, 'OWNER_ONLY');
    }
    if (member.role === 'owner' && roleRaw !== 'owner') {
      await this.assertNotLastOwner(workspaceId);
    }
    const [updated] = await this.database
      .update(workspaceMembers)
      // Owners can never be hidden, so promoting someone to owner also unhides them.
      .set(isOwner(roleRaw) ? { role: roleRaw, hidden: false } : { role: roleRaw })
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, targetUserId)
        )
      )
      .returning({
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
        hidden: workspaceMembers.hidden,
      });
    return this.toPublicMember(updated);
  }

  /** Hides a workspace from one member (or shows it again) without touching their role. */
  async setVisibility(
    actorId: string,
    workspaceId: string,
    targetUserId: string,
    hidden: boolean
  ): Promise<PublicMember> {
    await this.auth.requireMemberAdmin(actorId, workspaceId);
    const member = await this.requireMemberRow(workspaceId, targetUserId);
    this.assertCanHide(actorId, member, hidden);
    const [updated] = await this.database
      .update(workspaceMembers)
      .set({ hidden })
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, targetUserId)
        )
      )
      .returning({
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
        hidden: workspaceMembers.hidden,
      });
    return this.toPublicMember(updated);
  }

  /** The target's workspaces that the actor administers; nothing outside that set is listed. */
  async workspacesForMember(actorId: string, targetUserId: string): Promise<MemberWorkspace[]> {
    const actorMembership = alias(workspaceMembers, 'actor_membership');
    const rows = await this.database
      .select({
        workspaceId: workspaces.id,
        name: workspaces.name,
        role: workspaceMembers.role,
        hidden: workspaceMembers.hidden,
        actorRole: actorMembership.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .innerJoin(
        actorMembership,
        and(
          eq(actorMembership.workspaceId, workspaceMembers.workspaceId),
          eq(actorMembership.userId, actorId),
          eq(actorMembership.hidden, false)
        )
      )
      .where(and(eq(workspaceMembers.userId, targetUserId), isNull(workspaces.deletedAt)))
      .orderBy(asc(workspaces.name));
    return rows
      .filter((row) => canAdminMembers(row.actorRole))
      .map(({ workspaceId, name, role, hidden }) => ({ workspaceId, name, role, hidden }));
  }

  /** Sets visibility across several workspaces at once; all-or-nothing. */
  async setWorkspacesForMember(
    actorId: string,
    targetUserId: string,
    items: Array<{ workspaceId: string; hidden: boolean }>
  ): Promise<MemberWorkspace[]> {
    for (const item of items) {
      await this.auth.requireMemberAdmin(actorId, item.workspaceId);
      const member = await this.requireMemberRow(item.workspaceId, targetUserId);
      this.assertCanHide(actorId, member, item.hidden);
    }
    await this.database.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .update(workspaceMembers)
          .set({ hidden: item.hidden })
          .where(
            and(
              eq(workspaceMembers.workspaceId, item.workspaceId),
              eq(workspaceMembers.userId, targetUserId)
            )
          );
      }
    });
    return this.workspacesForMember(actorId, targetUserId);
  }

  private assertCanHide(actorId: string, member: { userId: string; role: string }, hidden: boolean): void {
    if (!hidden) return;
    if (member.userId === actorId) {
      throw new HttpError('You cannot hide a workspace from yourself', 409, 'CANNOT_HIDE_SELF');
    }
    if (isOwner(member.role)) {
      throw new HttpError('Owners always see their workspace', 409, 'CANNOT_HIDE_OWNER');
    }
  }

  private async toPublicMember(row: { userId: string; role: string; hidden: boolean }): Promise<PublicMember> {
    const [user] = await this.database
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    return { userId: row.userId, email: user.email, name: user.name, role: row.role, hidden: row.hidden };
  }

  async remove(actorId: string, workspaceId: string, targetUserId: string): Promise<void> {
    const actor = await this.auth.requireMemberAdmin(actorId, workspaceId);
    const member = await this.requireMemberRow(workspaceId, targetUserId);
    if (!isOwner(actor.role) && isOwner(member.role)) {
      throw new HttpError('Only an owner can remove an owner', 403, 'OWNER_ONLY');
    }
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
