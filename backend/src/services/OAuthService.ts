import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { oauthAccounts, oauthMobileCodes, users, workspaceInvites, workspaceMembers, workspaces } from '../db/schemas';
import { HttpError } from '../utils/HttpError';
import { env } from '../config/env';
import {
  defaultOAuthExchanger,
  isOAuthProvider,
  oauthConfigFromEnv,
  type OAuthExchanger,
  type OAuthProvider,
} from '../oauth/providers';
import {
  type AuthService,
  type AuthTokens,
  type Database,
  type PublicUser,
  type PublicWorkspace,
} from './AuthService';
import type { MemberService } from './MemberService';

type StatePayload = { provider: OAuthProvider; returnTo?: string; invite?: string };

const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** The only return URL a mobile OAuth start may ask the callback to use. */
export const MOBILE_OAUTH_RETURN = 'diramobile://oauth';
const MOBILE_CODE_TTL_MS = 2 * 60 * 1000;

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

type OAuthConfig = ReturnType<typeof oauthConfigFromEnv>;

export class OAuthService {
  private readonly config: OAuthConfig;

  constructor(
    private readonly database: Database,
    private readonly auth: AuthService,
    private readonly members: MemberService,
    private readonly exchanger: OAuthExchanger = defaultOAuthExchanger,
    config: OAuthConfig = oauthConfigFromEnv()
  ) {
    this.config = config;
  }

  status(): { google: boolean; github: boolean } {
    return {
      google: Boolean(this.config.google.clientId && this.config.google.clientSecret),
      github: Boolean(this.config.github.clientId && this.config.github.clientSecret),
    };
  }

  authorizeUrl(providerRaw: string, returnTo?: string, inviteRaw?: string): string {
    if (!isOAuthProvider(providerRaw)) {
      throw new HttpError('Unknown OAuth provider', 404, 'OAUTH_PROVIDER');
    }
    const creds = this.config[providerRaw];
    if (!creds.clientId || !creds.clientSecret) {
      throw new HttpError('OAuth is not configured', 503, 'OAUTH_UNAVAILABLE');
    }
    const mobileReturn = returnTo?.trim() || undefined;
    if (mobileReturn && mobileReturn !== MOBILE_OAUTH_RETURN) {
      throw new HttpError('Unknown return URL', 400, 'OAUTH_RETURN');
    }
    const invite = inviteRaw?.trim() || undefined;
    if (invite && !INVITE_TOKEN_PATTERN.test(invite)) {
      throw new HttpError('Invalid invite', 400, 'OAUTH_INVITE');
    }
    const payload: StatePayload = { provider: providerRaw };
    if (mobileReturn) payload.returnTo = mobileReturn;
    if (invite) payload.invite = invite;
    const state = jwt.sign(payload, env.jwtSecret, { expiresIn: '10m' });
    const redirectUri = this.redirectUri(providerRaw);
    if (providerRaw === 'google') {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', creds.clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'openid email profile');
      url.searchParams.set('state', state);
      return url.toString();
    }
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', creds.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'user:email');
    url.searchParams.set('state', state);
    return url.toString();
  }

  mobileReturn(providerRaw: string, state: string): string | null {
    return this.readState(providerRaw, state).returnTo;
  }

  async finish(
    providerRaw: string,
    code: string,
    state: string,
    options?: { issueTokens?: boolean }
  ): Promise<{
    tokens: AuthTokens | null;
    user: PublicUser;
    workspace: PublicWorkspace | null;
    joinedWorkspaceId: string | null;
  }> {
    if (!code.trim() || !state.trim()) {
      throw new HttpError('Invalid OAuth callback', 400, 'OAUTH_CALLBACK');
    }
    const { invite: inviteToken } = this.readState(providerRaw, state);
    if (!isOAuthProvider(providerRaw)) {
      throw new HttpError('Unknown OAuth provider', 404, 'OAUTH_PROVIDER');
    }
    const creds = this.config[providerRaw];
    if (!creds.clientId || !creds.clientSecret) {
      throw new HttpError('OAuth is not configured', 503, 'OAUTH_UNAVAILABLE');
    }

    let profile;
    try {
      profile = await this.exchanger({
        provider: providerRaw,
        code: code.trim(),
        redirectUri: this.redirectUri(providerRaw),
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const codeName = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      if (codeName === 'OAUTH_EMAIL_UNVERIFIED') {
        throw new HttpError('Email is not verified with this provider', 400, 'OAUTH_EMAIL_UNVERIFIED');
      }
      throw new HttpError('OAuth provider failed', 502, 'OAUTH_PROVIDER_ERROR');
    }

    const email = profile.email.trim().toLowerCase();
    if (!email || !email.includes('@') || !profile.providerUserId) {
      throw new HttpError('OAuth provider did not return an email', 400, 'OAUTH_EMAIL');
    }

    // Join only when the provider-verified email is the invited one; otherwise the
    // invite page explains the mismatch after a normal sign-in.
    const openInvite = inviteToken ? await this.members.findOpenInvite(inviteToken) : null;
    const invite = openInvite && openInvite.email === email ? openInvite : null;

    const [linked] = await this.database
      .select({ userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, providerRaw),
          eq(oauthAccounts.providerUserId, profile.providerUserId)
        )
      )
      .limit(1);

    let userId = linked?.userId;
    if (!userId) {
      const [existing] = await this.database
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (existing) {
        userId = existing.id;
        await this.database.insert(oauthAccounts).values({
          userId,
          provider: providerRaw,
          providerUserId: profile.providerUserId,
        });
      } else {
        const created = await this.database.transaction(async (tx) => {
          const [user] = await tx
            .insert(users)
            .values({ email, passwordHash: null })
            .returning({
              id: users.id,
              email: users.email,
              name: users.name,
              role: users.role,
              about: users.about,
            });
          await tx.insert(oauthAccounts).values({
            userId: user.id,
            provider: providerRaw,
            providerUserId: profile.providerUserId,
          });
          if (invite) {
            await tx.insert(workspaceMembers).values({
              workspaceId: invite.workspaceId,
              userId: user.id,
              role: invite.role,
            });
            await tx
              .update(workspaceInvites)
              .set({ acceptedAt: new Date() })
              .where(eq(workspaceInvites.id, invite.id));
            const workspace: PublicWorkspace = {
              id: invite.workspaceId,
              name: invite.workspaceName,
              description: invite.workspaceDescription,
              encrypted: invite.encrypted,
              mcpEnabled: invite.mcpEnabled ?? true,
              role: invite.role,
            };
            return { user, workspace };
          }
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
          return { user, workspace: { ...workspace, role: 'owner' } };
        });
        const tokens = options?.issueTokens === false ? null : await this.auth.issueSession(created.user.id);
        return {
          user: created.user,
          tokens,
          workspace: created.workspace,
          joinedWorkspaceId: invite ? invite.workspaceId : null,
        };
      }
    }

    let joined: PublicWorkspace | null = null;
    if (invite && inviteToken) {
      try {
        joined = (await this.members.acceptAsUser(inviteToken, userId)).workspace;
      } catch (error) {
        // Revoked or used between lookup and join: sign in without joining.
        if (!(error instanceof HttpError) || error.status !== 404) throw error;
      }
    }

    const user = await this.auth.me(userId);
    const tokens = options?.issueTokens === false ? null : await this.auth.issueSession(user.id);
    if (joined) {
      return { user, tokens, workspace: joined, joinedWorkspaceId: joined.id };
    }
    const workspacesForUser = await this.auth.listWorkspaces(user.id);
    return { user, tokens, workspace: workspacesForUser[0] ?? null, joinedWorkspaceId: null };
  }

  async createMobileCode(userId: string): Promise<string> {
    const code = crypto.randomBytes(32).toString('base64url');
    await this.database.insert(oauthMobileCodes).values({
      userId,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + MOBILE_CODE_TTL_MS),
    });
    return code;
  }

  async exchangeMobileCode(code: string): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const trimmed = code.trim();
    if (!trimmed) {
      throw new HttpError('This sign-in code is invalid or expired', 400, 'OAUTH_CODE');
    }
    const [row] = await this.database
      .update(oauthMobileCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(oauthMobileCodes.codeHash, hashCode(trimmed)),
          isNull(oauthMobileCodes.usedAt),
          gt(oauthMobileCodes.expiresAt, new Date())
        )
      )
      .returning({ userId: oauthMobileCodes.userId });
    if (!row) {
      throw new HttpError('This sign-in code is invalid or expired', 400, 'OAUTH_CODE');
    }
    const user = await this.auth.me(row.userId);
    const tokens = await this.auth.issueSession(user.id);
    return { user, tokens };
  }

  appRedirect(joinedWorkspaceId?: string | null): string {
    const url = new URL(`${env.appPublicUrl}/oauth`);
    if (joinedWorkspaceId) url.searchParams.set('workspace', joinedWorkspaceId);
    return url.toString();
  }

  private readState(providerRaw: string, state: string): { returnTo: string | null; invite: string | null } {
    if (!isOAuthProvider(providerRaw)) {
      throw new HttpError('Unknown OAuth provider', 404, 'OAUTH_PROVIDER');
    }
    let payload: StatePayload;
    try {
      payload = jwt.verify(state, env.jwtSecret) as StatePayload;
    } catch {
      throw new HttpError('Invalid OAuth state', 400, 'OAUTH_STATE');
    }
    if (payload.provider !== providerRaw) {
      throw new HttpError('Invalid OAuth state', 400, 'OAUTH_STATE');
    }
    if (payload.returnTo !== undefined && payload.returnTo !== MOBILE_OAUTH_RETURN) {
      throw new HttpError('Unknown return URL', 400, 'OAUTH_RETURN');
    }
    const invite = typeof payload.invite === 'string' && INVITE_TOKEN_PATTERN.test(payload.invite) ? payload.invite : null;
    return { returnTo: payload.returnTo ?? null, invite };
  }

  private redirectUri(provider: OAuthProvider): string {
    return `${this.config.apiPublicUrl}/api/auth/oauth/${provider}/callback`;
  }
}
