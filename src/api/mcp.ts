import { apiRequest } from './client';

export type McpToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  defaultWorkspaceId: string | null;
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
