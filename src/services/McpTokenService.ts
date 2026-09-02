import crypto from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { mcpAudit, mcpTokens, mcpTokenWorkspaceAccess, workspaces } from '../db/schemas';
import { canEdit } from '../authz/roles';
import { HttpError } from '../utils/HttpError';
import { slugify } from '../utils/slugify';
import { type AuthService, type Database, type PublicWorkspace } from './AuthService';

const TOKEN_PREFIX = 'dira_mcp_';

export interface PublicMcpToken {
  id: string;
  name: string;
  tokenPrefix: string;
  defaultWorkspaceId: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface TokenAccessRow {
  workspaceId: string;
  name: string;
  slug: string;
  role: string;
  mcpEnabled: boolean;
  allowlisted: boolean;
  canWrite: boolean;
}

export interface ResolvedMcpAuth {
  userId: string;
  tokenId: string | null;
  defaultWorkspaceId: string | null;
}

function hashToken(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export class McpTokenService {
  constructor(
    private readonly database: Database,
    private readonly auth: AuthService
  ) {}

  async listTokens(userId: string): Promise<PublicMcpToken[]> {
    return this.database
      .select({
        id: mcpTokens.id,
        name: mcpTokens.name,
        tokenPrefix: mcpTokens.tokenPrefix,
        defaultWorkspaceId: mcpTokens.defaultWorkspaceId,
        createdAt: mcpTokens.createdAt,
        lastUsedAt: mcpTokens.lastUsedAt,
        revokedAt: mcpTokens.revokedAt,
      })
      .from(mcpTokens)
      .where(and(eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)));
  }

  private buildAccessRows(
    memberships: PublicWorkspace[],
    grantByWs: Map<string, { workspaceId: string; canWrite: boolean }>
  ): TokenAccessRow[] {
    return memberships
      .filter((ws) => !ws.encrypted)
      .map((ws) => {
        const grant = grantByWs.get(ws.id);
        return {
          workspaceId: ws.id,
          name: ws.name,
          slug: slugify(ws.name),
          role: ws.role,
          mcpEnabled: ws.mcpEnabled !== false,
          allowlisted: Boolean(grant),
          canWrite: Boolean(grant?.canWrite) && canEdit(ws.role),
        };
      });
  }

  private async assertDefaultWithinGrants(
    tokenId: string,
    workspaceId: string,
    grantedIds?: Set<string>
  ): Promise<void> {
    let ids = grantedIds;
    if (!ids) {
      const rows = await this.database
        .select({ workspaceId: mcpTokenWorkspaceAccess.workspaceId })
        .from(mcpTokenWorkspaceAccess)
        .where(eq(mcpTokenWorkspaceAccess.tokenId, tokenId));
      ids = new Set(rows.map((r) => r.workspaceId));
    }
    if (!ids.has(workspaceId)) {
      throw new HttpError(
        "Default workspace must be one of the token's granted workspaces",
        409,
        'DEFAULT_NOT_GRANTED'
      );
    }
  }

  private async requireOwnedToken(userId: string, tokenId: string): Promise<void> {
    const [row] = await this.database
      .select({ id: mcpTokens.id })
      .from(mcpTokens)
      .where(and(eq(mcpTokens.id, tokenId), eq(mcpTokens.userId, userId)))
      .limit(1);
    if (!row) {
      throw new HttpError('Token not found', 404, 'TOKEN_NOT_FOUND');
    }
  }

  async createToken(
    userId: string,
    nameRaw: string,
    options: {
      defaultWorkspaceId?: string;
      workspaceAccess?: Array<{ workspaceId: string; canWrite?: boolean }>;
    } = {}
  ): Promise<PublicMcpToken & { secret: string; access: TokenAccessRow[] }> {
    const name = nameRaw.trim() || 'MCP token';
    const secret = TOKEN_PREFIX + crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashToken(secret);
    const tokenPrefix = secret.slice(0, 16);

    const memberships = await this.auth.listWorkspaces(userId);
    const byId = new Map(memberships.map((ws) => [ws.id, ws]));
    const seen = new Set<string>();
    const grants: Array<{ workspaceId: string; canWrite: boolean }> = [];
    for (const item of options.workspaceAccess ?? []) {
      if (seen.has(item.workspaceId)) continue;
      seen.add(item.workspaceId);
      const membership = byId.get(item.workspaceId);
      if (!membership) {
        throw new HttpError('Workspace not found', 404, 'WORKSPACE_NOT_FOUND');
      }
      if (membership.encrypted) {
        throw new HttpError('Encrypted workspaces cannot be exposed to MCP', 409, 'E2E_NO_MCP');
      }
      grants.push({
        workspaceId: item.workspaceId,
        canWrite: Boolean(item.canWrite) && canEdit(membership.role),
      });
    }
    const grantedIds = new Set(grants.map((g) => g.workspaceId));

    const row = await this.database.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(mcpTokens)
        .values({
          userId,
          name,
          tokenHash,
          tokenPrefix,
          defaultWorkspaceId: options.defaultWorkspaceId ?? null,
        })
        .returning({
          id: mcpTokens.id,
          name: mcpTokens.name,
          tokenPrefix: mcpTokens.tokenPrefix,
          defaultWorkspaceId: mcpTokens.defaultWorkspaceId,
          createdAt: mcpTokens.createdAt,
          lastUsedAt: mcpTokens.lastUsedAt,
          revokedAt: mcpTokens.revokedAt,
        });

      if (grants.length) {
        await tx.insert(mcpTokenWorkspaceAccess).values(
          grants.map((g) => ({
            tokenId: inserted.id,
            workspaceId: g.workspaceId,
            canWrite: g.canWrite,
          }))
        );
      }

      if (options.defaultWorkspaceId) {
        await this.assertDefaultWithinGrants(inserted.id, options.defaultWorkspaceId, grantedIds);
      }

      return inserted;
    });

    const grantByWs = new Map(grants.map((g) => [g.workspaceId, g]));
    const access = this.buildAccessRows(memberships, grantByWs);
    return { ...row, secret, access };
  }

  async updateToken(
    userId: string,
    tokenId: string,
    input: { name?: string; defaultWorkspaceId?: string | null }
  ): Promise<PublicMcpToken> {
    const [existing] = await this.database
      .select({ id: mcpTokens.id })
      .from(mcpTokens)
      .where(and(eq(mcpTokens.id, tokenId), eq(mcpTokens.userId, userId)))
      .limit(1);
    if (!existing) {
      throw new HttpError('Token not found', 404, 'TOKEN_NOT_FOUND');
    }
    if (input.defaultWorkspaceId) {
      await this.assertDefaultWithinGrants(tokenId, input.defaultWorkspaceId, undefined);
    }
    const patch: { name?: string; defaultWorkspaceId?: string | null } = {};
    if (input.name !== undefined) patch.name = input.name.trim() || 'MCP token';
    if (input.defaultWorkspaceId !== undefined) patch.defaultWorkspaceId = input.defaultWorkspaceId;
    const [row] = await this.database
      .update(mcpTokens)
      .set(patch)
      .where(eq(mcpTokens.id, tokenId))
      .returning({
        id: mcpTokens.id,
        name: mcpTokens.name,
        tokenPrefix: mcpTokens.tokenPrefix,
        defaultWorkspaceId: mcpTokens.defaultWorkspaceId,
        createdAt: mcpTokens.createdAt,
        lastUsedAt: mcpTokens.lastUsedAt,
        revokedAt: mcpTokens.revokedAt,
      });
    return row;
  }

  async revokeToken(userId: string, tokenId: string): Promise<void> {
    const [row] = await this.database
      .select({ id: mcpTokens.id })
      .from(mcpTokens)
      .where(and(eq(mcpTokens.id, tokenId), eq(mcpTokens.userId, userId)))
      .limit(1);
    if (!row) {
      throw new HttpError('Token not found', 404, 'TOKEN_NOT_FOUND');
    }
    await this.database
      .update(mcpTokens)
      .set({ revokedAt: new Date() })
      .where(eq(mcpTokens.id, tokenId));
  }

  async resolveSecret(secret: string): Promise<ResolvedMcpAuth | null> {
    if (!secret.startsWith(TOKEN_PREFIX)) return null;
    const tokenHash = hashToken(secret);
    const [row] = await this.database
      .select({
        id: mcpTokens.id,
        userId: mcpTokens.userId,
        defaultWorkspaceId: mcpTokens.defaultWorkspaceId,
        revokedAt: mcpTokens.revokedAt,
      })
      .from(mcpTokens)
      .where(eq(mcpTokens.tokenHash, tokenHash))
      .limit(1);
    if (!row || row.revokedAt) return null;
    await this.database
      .update(mcpTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(mcpTokens.id, row.id));
    return { userId: row.userId, tokenId: row.id, defaultWorkspaceId: row.defaultWorkspaceId };
  }

  async isTokenUsable(tokenId: string): Promise<{ defaultWorkspaceId: string | null } | null> {
    const [row] = await this.database
      .select({
        defaultWorkspaceId: mcpTokens.defaultWorkspaceId,
        revokedAt: mcpTokens.revokedAt,
      })
      .from(mcpTokens)
      .where(eq(mcpTokens.id, tokenId))
      .limit(1);
    if (!row || row.revokedAt) return null;
    return { defaultWorkspaceId: row.defaultWorkspaceId };
  }

  async findOrCreateOauthToken(
    userId: string,
    oauthClientId: string,
    clientName: string
  ): Promise<{ id: string }> {
    const [existing] = await this.database
      .select({ id: mcpTokens.id })
      .from(mcpTokens)
      .where(
        and(
          eq(mcpTokens.userId, userId),
          eq(mcpTokens.oauthClientId, oauthClientId),
          isNull(mcpTokens.revokedAt)
        )
      )
      .limit(1);
    if (existing) return existing;

    const raw = 'oauth_' + crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashToken(raw);
    const tokenPrefix = raw.slice(0, 16);
    const [inserted] = await this.database
      .insert(mcpTokens)
      .values({
        userId,
        name: clientName.trim() || 'MCP OAuth client',
        tokenHash,
        tokenPrefix,
        oauthClientId,
      })
      .returning({ id: mcpTokens.id });
    return inserted;
  }

  async listTokenAccess(userId: string, tokenId: string): Promise<TokenAccessRow[]> {
    await this.requireOwnedToken(userId, tokenId);
    const memberships = await this.auth.listWorkspaces(userId);
    const grants = await this.database
      .select()
      .from(mcpTokenWorkspaceAccess)
      .where(eq(mcpTokenWorkspaceAccess.tokenId, tokenId));
    const grantByWs = new Map(grants.map((g) => [g.workspaceId, g]));
    return this.buildAccessRows(memberships, grantByWs);
  }

  async setTokenAccess(
    userId: string,
    tokenId: string,
    items: Array<{ workspaceId: string; canWrite?: boolean }>
  ): Promise<TokenAccessRow[]> {
    await this.requireOwnedToken(userId, tokenId);
    const memberships = await this.auth.listWorkspaces(userId);
    const byId = new Map(memberships.map((ws) => [ws.id, ws]));
    const seen = new Set<string>();
    const next: Array<{ workspaceId: string; canWrite: boolean }> = [];
    for (const item of items) {
      if (seen.has(item.workspaceId)) continue;
      seen.add(item.workspaceId);
      const membership = byId.get(item.workspaceId);
      if (!membership) {
        throw new HttpError('Workspace not found', 404, 'WORKSPACE_NOT_FOUND');
      }
      if (membership.encrypted) {
        throw new HttpError('Encrypted workspaces cannot be exposed to MCP', 409, 'E2E_NO_MCP');
      }
      next.push({
        workspaceId: item.workspaceId,
        canWrite: Boolean(item.canWrite) && canEdit(membership.role),
      });
    }
    await this.database.transaction(async (tx) => {
      await tx.delete(mcpTokenWorkspaceAccess).where(eq(mcpTokenWorkspaceAccess.tokenId, tokenId));
      if (next.length) {
        await tx.insert(mcpTokenWorkspaceAccess).values(
          next.map((row) => ({ tokenId, workspaceId: row.workspaceId, canWrite: row.canWrite }))
        );
      }
    });
    return this.listTokenAccess(userId, tokenId);
  }

  async requireAllowlist(
    userId: string,
    tokenId: string | null,
    workspaceId: string,
    write: boolean
  ): Promise<{ workspace: PublicWorkspace; canWrite: boolean }> {
    const workspace = await this.auth.requireMember(userId, workspaceId);
    if (workspace.encrypted) {
      throw new HttpError('Encrypted workspaces cannot be exposed to MCP', 409, 'E2E_NO_MCP');
    }
    if (workspace.mcpEnabled === false) {
      throw new HttpError('MCP is disabled for this workspace', 403, 'MCP_DISABLED');
    }
    if (!tokenId) {
      throw new HttpError('Workspace is not allowlisted for MCP', 403, 'MCP_NOT_ALLOWLISTED');
    }
    const [grant] = await this.database
      .select()
      .from(mcpTokenWorkspaceAccess)
      .where(
        and(
          eq(mcpTokenWorkspaceAccess.tokenId, tokenId),
          eq(mcpTokenWorkspaceAccess.workspaceId, workspaceId)
        )
      )
      .limit(1);
    if (!grant) {
      throw new HttpError('Workspace is not allowlisted for MCP', 403, 'MCP_NOT_ALLOWLISTED');
    }
    const canWrite = grant.canWrite && canEdit(workspace.role);
    if (write && !canWrite) {
      throw new HttpError('MCP write is not allowed for this workspace', 403, 'MCP_READ_ONLY');
    }
    return { workspace, canWrite };
  }

  async getAgentIndexPaths(workspaceIds: string[]): Promise<Map<string, string | null>> {
    if (!workspaceIds.length) return new Map();
    const rows = await this.database
      .select({ id: workspaces.id, agentIndexPath: workspaces.agentIndexPath })
      .from(workspaces)
      .where(inArray(workspaces.id, workspaceIds));
    return new Map(rows.map((row) => [row.id, row.agentIndexPath]));
  }

  async setWorkspaceMcpEnabled(
    userId: string,
    workspaceId: string,
    enabled: boolean
  ): Promise<PublicWorkspace> {
    await this.auth.requireWorkspaceOwner(userId, workspaceId);
    await this.database
      .update(workspaces)
      .set({ mcpEnabled: enabled, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));
    return this.auth.getWorkspace(userId, workspaceId);
  }

  async recordAudit(entry: {
    userId?: string | null;
    workspaceId?: string | null;
    tokenId?: string | null;
    tool: string;
    nodeId?: string | null;
    outcome: string;
  }): Promise<void> {
    try {
      await this.database.insert(mcpAudit).values({
        userId: entry.userId ?? null,
        workspaceId: entry.workspaceId ?? null,
        tokenId: entry.tokenId ?? null,
        tool: entry.tool,
        nodeId: entry.nodeId ?? null,
        outcome: entry.outcome,
      });
    } catch (error) {
      console.error('[mcp-audit]', error instanceof Error ? error.message : error);
    }
  }
}
