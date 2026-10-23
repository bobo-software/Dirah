import { apiRequest } from './client';

export type McpToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  defaultWorkspaceId: string | null;
  /** Set when an AI app (Claude, ChatGPT, …) connected via OAuth instead of a pasted token. */
  oauthClientId?: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  secret?: string;
};

export type TokenAccessRow = {
  workspaceId: string;
  name: string;
  slug: string;
  role: string;
  mcpEnabled: boolean;
  allowlisted: boolean;
  canWrite: boolean;
};

export async function listMcpTokens(accessToken: string): Promise<McpToken[]> {
  const data = await apiRequest<{ tokens: McpToken[] }>('/api/mcp/tokens', { accessToken });
  return data.tokens;
}

export async function createMcpToken(
  accessToken: string,
  name: string,
  defaultWorkspaceId?: string,
  workspaceAccess?: Array<{ workspaceId: string; canWrite?: boolean }>
): Promise<McpToken & { secret: string; access: TokenAccessRow[] }> {
  const data = await apiRequest<{ token: McpToken & { secret: string; access: TokenAccessRow[] } }>(
    '/api/mcp/tokens',
    {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ name, defaultWorkspaceId, workspaceAccess }),
    }
  );
  return data.token;
}

export async function updateMcpToken(
  accessToken: string,
  id: string,
  input: { name?: string; defaultWorkspaceId?: string | null }
): Promise<McpToken> {
  const data = await apiRequest<{ token: McpToken }>(`/api/mcp/tokens/${id}`, {
    method: 'PATCH',
    accessToken,
    body: JSON.stringify(input),
  });
  return data.token;
}

export async function rotateMcpToken(accessToken: string, id: string): Promise<McpToken & { secret: string }> {
  const data = await apiRequest<{ token: McpToken & { secret: string } }>(`/api/mcp/tokens/${id}/rotate`, {
    method: 'POST',
    accessToken,
  });
  return data.token;
}

export async function revokeMcpToken(accessToken: string, id: string): Promise<void> {
  await apiRequest(`/api/mcp/tokens/${id}`, { method: 'DELETE', accessToken });
}

export async function listTokenAccess(accessToken: string, tokenId: string): Promise<TokenAccessRow[]> {
  const data = await apiRequest<{ workspaces: TokenAccessRow[] }>(`/api/mcp/tokens/${tokenId}/access`, {
    accessToken,
  });
  return data.workspaces;
}

export async function setTokenAccess(
  accessToken: string,
  tokenId: string,
  workspaces: Array<{ workspaceId: string; canWrite?: boolean }>
): Promise<TokenAccessRow[]> {
  const data = await apiRequest<{ workspaces: TokenAccessRow[] }>(`/api/mcp/tokens/${tokenId}/access`, {
    method: 'PUT',
    accessToken,
    body: JSON.stringify({ workspaces }),
  });
  return data.workspaces;
}

export async function setWorkspaceMcpEnabled(
  accessToken: string,
  workspaceId: string,
  mcpEnabled: boolean
): Promise<{ mcpEnabled: boolean }> {
  const data = await apiRequest<{ workspace: { mcpEnabled: boolean } }>(
    `/api/workspaces/${workspaceId}`,
    {
      method: 'PATCH',
      accessToken,
      body: JSON.stringify({ mcpEnabled }),
    }
  );
  return data.workspace;
}

export type OAuthClientInfo = {
  clientId: string;
  clientName: string;
  redirectHost: string;
};

export async function getOAuthClient(
  accessToken: string,
  clientId: string,
  redirectUri: string
): Promise<OAuthClientInfo> {
  const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri });
  return apiRequest<OAuthClientInfo>(`/api/mcp/oauth/client?${query.toString()}`, { accessToken });
}

export async function answerOAuthRequest(
  accessToken: string,
  input: {
    clientId: string;
    redirectUri: string;
    codeChallenge?: string;
    state?: string;
    resource?: string;
    scope?: string;
    deny?: boolean;
    workspaces?: Array<{ workspaceId: string; canWrite: boolean }>;
  }
): Promise<{ redirectTo: string }> {
  return apiRequest<{ redirectTo: string }>('/api/mcp/oauth/approve', {
    method: 'POST',
    accessToken,
    body: JSON.stringify(input),
  });
}
