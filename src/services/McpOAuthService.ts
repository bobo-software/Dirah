import crypto from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { mcpOauthClients, mcpOauthCodes, mcpOauthRefreshTokens } from '../db/schemas';
import { HttpError } from '../utils/HttpError';
import { MCP_ACCESS_TOKEN_TTL_SECONDS, signMcpAccessToken } from '../utils/jwt';
import { type Database } from './AuthService';
import type { McpTokenService } from './McpTokenService';

const SCOPE = 'dirah.docs';
const CODE_TTL_MS = 10 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_REDIRECT_URIS = 10;
const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * OAuth error codes. Every HttpError thrown from this service carries one of these
 * as its `code`, so routes can map it straight to the RFC 6749 `error` field.
 */
export type McpOAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_client_metadata'
  | 'invalid_redirect_uri'
  | 'invalid_grant'
  | 'unsupported_grant_type'
  | 'unsupported_response_type'
  | 'invalid_target'
  | 'access_denied';

function oauthError(code: McpOAuthErrorCode, message: string, status = 400): HttpError {
  return new HttpError(message, status, code);
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function s256(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isAllowedRedirectUri(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (BLOCKED_SCHEMES.has(url.protocol)) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:') return LOOPBACK_HOSTS.has(url.hostname);
  // Private-use schemes for native clients (cursor://, vscode://, com.example.app:/cb).
  return /^[a-z][a-z0-9+.-]*:$/i.test(url.protocol);
}

export type AuthorizeOutcome =
  | { kind: 'consent'; location: string }
  | { kind: 'redirect'; location: string }
  | { kind: 'error'; status: number; message: string };

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export class McpOAuthService {
  readonly resource: string;

  constructor(
    private readonly database: Database,
    private readonly apiPublicUrl: string,
    private readonly appPublicUrl: string,
    private readonly tokens: McpTokenService
  ) {
    this.resource = `${trimSlash(apiPublicUrl)}/mcp`;
  }

  metadata() {
    const issuer = this.apiPublicUrl;
    return {
      issuer,
      authorization_endpoint: `${issuer}/mcp/oauth/authorize`,
      token_endpoint: `${issuer}/mcp/oauth/token`,
      registration_endpoint: `${issuer}/mcp/oauth/register`,
      revocation_endpoint: `${issuer}/mcp/oauth/revoke`,
      code_challenge_methods_supported: ['S256'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [SCOPE],
    };
  }

  protectedResource() {
    return {
      resource: this.resource,
      resource_name: 'Dirah',
      authorization_servers: [this.apiPublicUrl],
      bearer_methods_supported: ['header'],
      scopes_supported: [SCOPE],
    };
  }

  /** RFC 8707: we serve exactly one resource. Absent is fine; anything else is rejected. */
  private checkResource(resource: string | undefined | null): void {
    if (!resource) return;
    if (trimSlash(resource) !== this.resource) {
      throw oauthError('invalid_target', `Unknown resource; expected ${this.resource}`);
    }
  }

  async register(input: {
    client_name?: unknown;
    redirect_uris?: unknown;
  }) {
    const rawUris = Array.isArray(input.redirect_uris) ? input.redirect_uris : [];
    const redirectUris = rawUris.filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
    if (!redirectUris.length) {
      throw oauthError('invalid_redirect_uri', 'redirect_uris is required');
    }
    if (redirectUris.length > MAX_REDIRECT_URIS) {
      throw oauthError('invalid_redirect_uri', `At most ${MAX_REDIRECT_URIS} redirect_uris are allowed`);
    }
    const bad = redirectUris.find((uri) => !isAllowedRedirectUri(uri));
    if (bad) {
      throw oauthError(
        'invalid_redirect_uri',
        `redirect_uri must be https, http loopback, or a private-use scheme: ${bad}`
      );
    }
    const clientName =
      (typeof input.client_name === 'string' ? input.client_name.trim().slice(0, 100) : '') ||
      'MCP client';
    const id = `dirah_${crypto.randomBytes(12).toString('hex')}`;
    await this.database.insert(mcpOauthClients).values({
      id,
      clientName,
      redirectUris: JSON.stringify(redirectUris),
    });
    return {
      client_id: id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: SCOPE,
    };
  }

  /**
   * Validate an /authorize request before sending the user to log in. Bad client or
   * redirect_uri must never redirect (open-redirect); other errors go back to the client.
   */
  async authorize(query: Record<string, unknown>): Promise<AuthorizeOutcome> {
    const q = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : undefined);
    const clientId = q('client_id');
    const redirectUri = q('redirect_uri');
    if (!clientId) return { kind: 'error', status: 400, message: 'client_id is required' };
    const client = await this.findClient(clientId);
    if (!client) return { kind: 'error', status: 400, message: 'Unknown client_id' };
    if (!redirectUri || !this.redirectUris(client).includes(redirectUri)) {
      return { kind: 'error', status: 400, message: 'redirect_uri is not registered for this client' };
    }

    const state = q('state');
    const back = (error: string, description: string): AuthorizeOutcome => {
      const target = new URL(redirectUri);
      target.searchParams.set('error', error);
      target.searchParams.set('error_description', description);
      if (state) target.searchParams.set('state', state);
      return { kind: 'redirect', location: target.toString() };
    };

    if (q('response_type') !== 'code') {
      return back('unsupported_response_type', 'response_type must be code');
    }
    if (!q('code_challenge')) return back('invalid_request', 'code_challenge is required');
    if (q('code_challenge_method') !== 'S256') {
      return back('invalid_request', 'code_challenge_method must be S256');
    }
    try {
      this.checkResource(q('resource'));
    } catch (error) {
      return back('invalid_target', (error as Error).message);
    }

    const params = new URLSearchParams();
    for (const key of ['client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'resource', 'scope']) {
      const value = q(key);
      if (value) params.set(key, value);
    }
    return { kind: 'consent', location: `${this.appPublicUrl}/settings/mcp-oauth?${params.toString()}` };
  }

  /** What the consent screen shows: who is asking and where the user will be sent. */
  async describeClient(clientId: string, redirectUri: string) {
    const client = await this.requireClientWithRedirect(clientId, redirectUri);
    const target = new URL(redirectUri);
    return {
      clientId: client.id,
      clientName: client.clientName,
      redirectHost: target.host || target.protocol.replace(/:$/, ''),
    };
  }

  async approve(
    userId: string,
    input: {
      clientId: string;
      redirectUri: string;
      codeChallenge?: string;
      state?: string;
      resource?: string;
      scope?: string;
      deny?: boolean;
      workspaces?: Array<{ workspaceId: string; canWrite?: boolean }>;
    }
  ): Promise<{ redirectTo: string }> {
    const client = await this.requireClientWithRedirect(input.clientId, input.redirectUri);
    const target = new URL(input.redirectUri);
    if (input.state) target.searchParams.set('state', input.state);

    if (input.deny) {
      target.searchParams.set('error', 'access_denied');
      target.searchParams.set('error_description', 'The user denied access');
      return { redirectTo: target.toString() };
    }
    if (!input.codeChallenge) {
      throw oauthError('invalid_request', 'code_challenge is required');
    }
    this.checkResource(input.resource);
    if (!input.workspaces?.length) {
      throw oauthError('invalid_request', 'Choose at least one workspace to share');
    }

    const token = await this.tokens.findOrCreateOauthToken(userId, client.id, client.clientName);
    await this.tokens.setTokenAccess(userId, token.id, input.workspaces);

    const code = crypto.randomBytes(24).toString('base64url');
    await this.database.insert(mcpOauthCodes).values({
      codeHash: hash(code),
      clientId: client.id,
      userId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      resource: input.resource ?? null,
      scope: SCOPE,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
    target.searchParams.set('code', code);
    return { redirectTo: target.toString() };
  }

  async token(input: Record<string, unknown>): Promise<TokenResponse> {
    const grantType = typeof input.grant_type === 'string' ? input.grant_type : undefined;
    if (grantType === 'authorization_code') return this.exchangeCode(input);
    if (grantType === 'refresh_token') return this.refresh(input);
    throw oauthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
  }

  private async exchangeCode(input: Record<string, unknown>): Promise<TokenResponse> {
    const { code, client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier, resource } =
      input as Record<string, string | undefined>;
    if (!code || !clientId || !redirectUri || !verifier) {
      throw oauthError('invalid_request', 'code, client_id, redirect_uri, and code_verifier are required');
    }
    this.checkResource(resource);
    const [row] = await this.database
      .select()
      .from(mcpOauthCodes)
      .where(and(eq(mcpOauthCodes.codeHash, hash(code)), isNull(mcpOauthCodes.usedAt)))
      .limit(1);
    if (!row || row.expiresAt.getTime() < Date.now()) {
      throw oauthError('invalid_grant', 'Invalid or expired code');
    }
    if (row.clientId !== clientId || row.redirectUri !== redirectUri) {
      throw oauthError('invalid_grant', 'Invalid code');
    }
    if (s256(verifier) !== row.codeChallenge) {
      throw oauthError('invalid_grant', 'PKCE verification failed');
    }
    if (resource && row.resource && trimSlash(resource) !== trimSlash(row.resource)) {
      throw oauthError('invalid_target', 'resource does not match the authorization request');
    }
    // Conditional update so two concurrent exchanges of the same code cannot both win.
    const claimed = await this.database
      .update(mcpOauthCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(mcpOauthCodes.codeHash, row.codeHash), isNull(mcpOauthCodes.usedAt)))
      .returning({ codeHash: mcpOauthCodes.codeHash });
    if (!claimed.length) {
      throw oauthError('invalid_grant', 'Invalid or expired code');
    }
    const client = await this.requireClient(row.clientId);
    const token = await this.tokens.findOrCreateOauthToken(row.userId, client.id, client.clientName);
    return this.issue(row.userId, token.id, client.id, row.resource, row.scope);
  }

  private async refresh(input: Record<string, unknown>): Promise<TokenResponse> {
    const { refresh_token: refreshToken, client_id: clientId, resource } = input as Record<
      string,
      string | undefined
    >;
    if (!refreshToken || !clientId) {
      throw oauthError('invalid_request', 'refresh_token and client_id are required');
    }
    this.checkResource(resource);
    const tokenHash = hash(refreshToken);
    const [row] = await this.database
      .select()
      .from(mcpOauthRefreshTokens)
      .where(eq(mcpOauthRefreshTokens.tokenHash, tokenHash))
      .limit(1);
    if (!row || row.clientId !== clientId) {
      throw oauthError('invalid_grant', 'Invalid refresh token');
    }
    if (row.usedAt) {
      // A rotated-out refresh token came back: assume it leaked and kill the whole chain.
      await this.revokeChain(row.tokenId);
      throw oauthError('invalid_grant', 'Refresh token was already used');
    }
    if (row.revokedAt || row.expiresAt.getTime() < Date.now()) {
      throw oauthError('invalid_grant', 'Refresh token is expired or revoked');
    }
    if (!(await this.tokens.isTokenUsable(row.tokenId))) {
      throw oauthError('invalid_grant', 'This connection was revoked');
    }
    const claimed = await this.database
      .update(mcpOauthRefreshTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(mcpOauthRefreshTokens.tokenHash, tokenHash),
          isNull(mcpOauthRefreshTokens.usedAt),
          isNull(mcpOauthRefreshTokens.revokedAt)
        )
      )
      .returning({ tokenHash: mcpOauthRefreshTokens.tokenHash });
    if (!claimed.length) {
      await this.revokeChain(row.tokenId);
      throw oauthError('invalid_grant', 'Refresh token was already used');
    }
    return this.issue(row.userId, row.tokenId, row.clientId, row.resource, row.scope);
  }

  /** RFC 7009. Unknown or already-revoked tokens still succeed. */
  async revoke(input: Record<string, unknown>): Promise<void> {
    const token = typeof input.token === 'string' ? input.token : '';
    if (!token) throw oauthError('invalid_request', 'token is required');
    const [row] = await this.database
      .select({ tokenId: mcpOauthRefreshTokens.tokenId })
      .from(mcpOauthRefreshTokens)
      .where(eq(mcpOauthRefreshTokens.tokenHash, hash(token)))
      .limit(1);
    if (row) await this.revokeChain(row.tokenId);
  }

  private async revokeChain(tokenId: string): Promise<void> {
    await this.database
      .update(mcpOauthRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(mcpOauthRefreshTokens.tokenId, tokenId), isNull(mcpOauthRefreshTokens.revokedAt)));
  }

  private async issue(
    userId: string,
    tokenId: string,
    clientId: string,
    resource: string | null,
    scope: string | null
  ): Promise<TokenResponse> {
    const refreshToken = 'dirah_rt_' + crypto.randomBytes(32).toString('base64url');
    await this.database.insert(mcpOauthRefreshTokens).values({
      tokenHash: hash(refreshToken),
      tokenId,
      clientId,
      userId,
      resource,
      scope,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    return {
      access_token: signMcpAccessToken(userId, tokenId, this.resource),
      token_type: 'Bearer',
      expires_in: MCP_ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: scope ?? SCOPE,
    };
  }

  private redirectUris(client: { redirectUris: string }): string[] {
    return JSON.parse(client.redirectUris) as string[];
  }

  private async findClient(clientId: string) {
    const [client] = await this.database
      .select()
      .from(mcpOauthClients)
      .where(eq(mcpOauthClients.id, clientId))
      .limit(1);
    return client ?? null;
  }

  private async requireClient(clientId: string) {
    const client = await this.findClient(clientId);
    if (!client) {
      throw oauthError('invalid_client', 'Unknown client');
    }
    return client;
  }

  private async requireClientWithRedirect(clientId: string, redirectUri: string) {
    const client = await this.requireClient(clientId);
    if (!this.redirectUris(client).includes(redirectUri)) {
      throw oauthError('invalid_request', 'redirect_uri is not registered for this client');
    }
    return client;
  }
}
