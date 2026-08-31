import crypto from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { mcpAudit, mcpTokens, mcpWorkspaceAccess, workspaces } from '../db/schemas';
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

export interface McpAccessRow {
  workspaceId: string;
  name: string;
  slug: string;
  role: string;
  encrypted: boolean;
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

  private async assertUsableDefaultWorkspace(userId: string, workspaceId: string): Promise<void> {
    const memberships = await this.auth.listWorkspaces(userId);
    const membership = memberships.find((ws) => ws.id === workspaceId);
    if (!membership) {
      throw new HttpError('Workspace not found', 404, 'WORKSPACE_NOT_FOUND');
    }
    if (membership.encrypted) {
      throw new HttpError('Encrypted workspaces cannot be exposed to MCP', 409, 'E2E_NO_MCP');
    }
  }

  async createToken(
    userId: string,
    nameRaw: string,
    options: { defaultWorkspaceId?: string } = {}
  ): Promise<PublicMcpToken & { secret: string }> {
    const name = nameRaw.trim() || 'MCP token';
    if (options.defaultWorkspaceId) {
      await this.assertUsableDefaultWorkspace(userId, options.defaultWorkspaceId);
    }
    const secret = TOKEN_PREFIX + crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashToken(secret);
    const tokenPrefix = secret.slice(0, 16);
    const [row] = await this.database
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
    return { ...row, secret };
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
      await this.assertUsableDefaultWorkspace(userId, input.defaultWorkspaceId);
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

  async listAccess(userId: string): Promise<McpAccessRow[]> {
    const memberships = await this.auth.listWorkspaces(userId);
    const grants = await this.database
      .select()
      .from(mcpWorkspaceAccess)
      .where(eq(mcpWorkspaceAccess.userId, userId));
    const grantByWs = new Map(grants.map((row) => [row.workspaceId, row]));
    return memberships.map((ws) => {
      const grant = grantByWs.get(ws.id);
      return {
        workspaceId: ws.id,
        name: ws.name,
        slug: slugify(ws.name),
        role: ws.role,
        encrypted: ws.encrypted,
        mcpEnabled: ws.mcpEnabled !== false,
        allowlisted: Boolean(grant),
        canWrite: Boolean(grant?.canWrite) && canEdit(ws.role),
      };
    });
  }

  async setAccess(
    userId: string,
    items: Array<{ workspaceId: string; canWrite?: boolean }>
  ): Promise<McpAccessRow[]> {
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
        throw new HttpError(
          'Encrypted workspaces cannot be exposed to MCP',
          409,
          'E2E_NO_MCP'
        );
      }
      const canWrite = Boolean(item.canWrite) && canEdit(membership.role);
      next.push({ workspaceId: item.workspaceId, canWrite });
    }
    await this.database.transaction(async (tx) => {
      await tx.delete(mcpWorkspaceAccess).where(eq(mcpWorkspaceAccess.userId, userId));
      if (next.length) {
        await tx.insert(mcpWorkspaceAccess).values(
          next.map((row) => ({
            userId,
            workspaceId: row.workspaceId,
            canWrite: row.canWrite,
          }))
        );
      }
    });
    return this.listAccess(userId);
  }

  async requireAllowlist(
    userId: string,
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
    const [grant] = await this.database
      .select()
      .from(mcpWorkspaceAccess)
      .where(
        and(eq(mcpWorkspaceAccess.userId, userId), eq(mcpWorkspaceAccess.workspaceId, workspaceId))
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
