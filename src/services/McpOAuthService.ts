import crypto from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { mcpOauthClients, mcpOauthCodes } from '../db/schemas';
import { HttpError } from '../utils/HttpError';
import { signMcpAccessToken } from '../utils/jwt';
import { type Database } from './AuthService';
import type { McpTokenService } from './McpTokenService';

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function s256(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export class McpOAuthService {
  constructor(
    private readonly database: Database,
    private readonly apiPublicUrl: string,
    private readonly appPublicUrl: string,
    private readonly tokens: McpTokenService
  ) {}

  metadata() {
    const issuer = this.apiPublicUrl;
    return {
      issuer,
      authorization_endpoint: `${issuer}/mcp/oauth/authorize`,
      token_endpoint: `${issuer}/mcp/oauth/token`,
      registration_endpoint: `${issuer}/mcp/oauth/register`,
      code_challenge_methods_supported: ['S256'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['dirah.docs'],
    };
  }

  protectedResource() {
    return {
      resource: `${this.apiPublicUrl}/mcp`,
      authorization_servers: [this.apiPublicUrl],
      bearer_methods_supported: ['header'],
      scopes_supported: ['dirah.docs'],
    };
  }

  async register(input: { client_name?: string; redirect_uris?: string[] }) {
    const redirectUris = (input.redirect_uris ?? []).filter((uri) => typeof uri === 'string' && uri.length > 0);
    if (!redirectUris.length) {
      throw new HttpError('redirect_uris is required', 400, 'INVALID_CLIENT');
    }
    const id = `dirah_${crypto.randomBytes(12).toString('hex')}`;
    await this.database.insert(mcpOauthClients).values({
      id,
      clientName: input.client_name?.trim() || 'MCP client',
      redirectUris: JSON.stringify(redirectUris),
    });
    return {
      client_id: id,
      client_name: input.client_name?.trim() || 'MCP client',
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    };
  }

  authorizeRedirect(query: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    for (const key of ['client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'response_type']) {
      const value = query[key];
      if (value) params.set(key, value);
    }
    return `${this.appPublicUrl}/settings/mcp-oauth?${params.toString()}`;
  }

  async approve(
    userId: string,
    input: {
      clientId: string;
      redirectUri: string;
      codeChallenge: string;
      state?: string;
    }
  ): Promise<{ redirectTo: string }> {
    const client = await this.requireClient(input.clientId);
    const uris = JSON.parse(client.redirectUris) as string[];
    if (!uris.includes(input.redirectUri)) {
      throw new HttpError('redirect_uri is not registered', 400, 'INVALID_REDIRECT');
    }
    if (!input.codeChallenge) {
      throw new HttpError('code_challenge is required', 400, 'INVALID_PKCE');
    }
    const code = crypto.randomBytes(24).toString('base64url');
    await this.database.insert(mcpOauthCodes).values({
      codeHash: hash(code),
      clientId: client.id,
      userId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    const target = new URL(input.redirectUri);
    target.searchParams.set('code', code);
    if (input.state) target.searchParams.set('state', input.state);
    return { redirectTo: target.toString() };
  }

  async token(input: {
    grant_type?: string;
    code?: string;
    redirect_uri?: string;
    client_id?: string;
    code_verifier?: string;
  }): Promise<{ access_token: string; token_type: string; expires_in: number; scope: string }> {
    if (input.grant_type !== 'authorization_code') {
      throw new HttpError('grant_type must be authorization_code', 400, 'INVALID_GRANT');
    }
    if (!input.code || !input.client_id || !input.redirect_uri || !input.code_verifier) {
      throw new HttpError('code, client_id, redirect_uri, and code_verifier are required', 400, 'INVALID_GRANT');
    }
    const [row] = await this.database
      .select()
      .from(mcpOauthCodes)
      .where(and(eq(mcpOauthCodes.codeHash, hash(input.code)), isNull(mcpOauthCodes.usedAt)))
      .limit(1);
    if (!row || row.expiresAt.getTime() < Date.now()) {
      throw new HttpError('Invalid or expired code', 400, 'INVALID_GRANT');
    }
    if (row.clientId !== input.client_id || row.redirectUri !== input.redirect_uri) {
      throw new HttpError('Invalid code', 400, 'INVALID_GRANT');
    }
    if (s256(input.code_verifier) !== row.codeChallenge) {
      throw new HttpError('PKCE verification failed', 400, 'INVALID_GRANT');
    }
    await this.database
      .update(mcpOauthCodes)
      .set({ usedAt: new Date() })
      .where(eq(mcpOauthCodes.codeHash, row.codeHash));
    const client = await this.requireClient(row.clientId);
    const token = await this.tokens.findOrCreateOauthToken(row.userId, client.id, client.clientName);
    return {
      access_token: signMcpAccessToken(row.userId, token.id),
      token_type: 'Bearer',
      expires_in: 8 * 60 * 60,
      scope: 'dirah.docs',
    };
  }

  private async requireClient(clientId: string) {
    const [client] = await this.database
      .select()
      .from(mcpOauthClients)
      .where(eq(mcpOauthClients.id, clientId))
      .limit(1);
    if (!client) {
      throw new HttpError('Unknown client', 400, 'INVALID_CLIENT');
    }
    return client;
  }
}
