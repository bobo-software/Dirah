import jwt from 'jsonwebtoken';
import { and, eq } from 'drizzle-orm';
import { oauthAccounts, users, workspaceMembers, workspaces } from '../db/schemas';
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

type StatePayload = { provider: OAuthProvider };
type OAuthConfig = ReturnType<typeof oauthConfigFromEnv>;

export class OAuthService {
  private readonly config: OAuthConfig;

  constructor(
    private readonly database: Database,
    private readonly auth: AuthService,
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

  authorizeUrl(providerRaw: string): string {
    if (!isOAuthProvider(providerRaw)) {
      throw new HttpError('Unknown OAuth provider', 404, 'OAUTH_PROVIDER');
    }
    const creds = this.config[providerRaw];
    if (!creds.clientId || !creds.clientSecret) {
      throw new HttpError('OAuth is not configured', 503, 'OAUTH_UNAVAILABLE');
    }
    const state = jwt.sign({ provider: providerRaw } satisfies StatePayload, env.jwtSecret, {
      expiresIn: '10m',
    });
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

  async finish(
    providerRaw: string,
    code: string,
    state: string
  ): Promise<{ tokens: AuthTokens; user: PublicUser; workspace: PublicWorkspace | null }> {
    if (!isOAuthProvider(providerRaw)) {
      throw new HttpError('Unknown OAuth provider', 404, 'OAUTH_PROVIDER');
    }
    if (!code.trim() || !state.trim()) {
      throw new HttpError('Invalid OAuth callback', 400, 'OAUTH_CALLBACK');
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
          await tx.insert(oauthAccounts).values({
            userId: user.id,
            provider: providerRaw,
            providerUserId: profile.providerUserId,
          });
          return { user, workspace };
        });
        const tokens = await this.auth.issueSession(created.user.id);
        return {
          user: created.user,
          tokens,
          workspace: { ...created.workspace, role: 'owner' },
        };
      }
    }

    const user = await this.auth.me(userId);
    const tokens = await this.auth.issueSession(user.id);
    const workspacesForUser = await this.auth.listWorkspaces(user.id);
    return { user, tokens, workspace: workspacesForUser[0] ?? null };
  }

  appRedirect(refreshToken: string): string {
    return `${env.appPublicUrl}/oauth#refreshToken=${encodeURIComponent(refreshToken)}`;
  }

  private redirectUri(provider: OAuthProvider): string {
    return `${this.config.apiPublicUrl}/api/auth/oauth/${provider}/callback`;
  }
}
