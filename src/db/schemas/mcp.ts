import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { workspaces } from './workspaces';

export const mcpTokens = pgTable(
  'mcp_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    defaultWorkspaceId: uuid('default_workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    oauthClientId: text('oauth_client_id').references(() => mcpOauthClients.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    // Partial so a user can reconnect the same OAuth client after revoking it.
    userOauthClientUnique: uniqueIndex('mcp_tokens_user_oauth_client_active')
      .on(table.userId, table.oauthClientId)
      .where(sql`${table.revokedAt} is null`),
  })
);

export const mcpTokenWorkspaceAccess = pgTable(
  'mcp_token_workspace_access',
  {
    tokenId: uuid('token_id')
      .notNull()
      .references(() => mcpTokens.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    canWrite: boolean('can_write').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.tokenId, table.workspaceId],
      name: 'mcp_token_workspace_access_pk',
    }),
  })
);

export const mcpAudit = pgTable('mcp_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
  tokenId: uuid('token_id').references(() => mcpTokens.id, { onDelete: 'set null' }),
  tool: text('tool').notNull(),
  nodeId: uuid('node_id'),
  outcome: text('outcome').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mcpOauthClients = pgTable('mcp_oauth_clients', {
  id: text('id').primaryKey(),
  clientName: text('client_name').notNull().default('MCP client'),
  redirectUris: text('redirect_uris').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mcpOauthCodes = pgTable('mcp_oauth_codes', {
  codeHash: text('code_hash').primaryKey(),
  clientId: text('client_id')
    .notNull()
    .references(() => mcpOauthClients.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  resource: text('resource'),
  scope: text('scope'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

export const mcpOauthRefreshTokens = pgTable(
  'mcp_oauth_refresh_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    tokenId: uuid('token_id')
      .notNull()
      .references(() => mcpTokens.id, { onDelete: 'cascade' }),
    clientId: text('client_id')
      .notNull()
      .references(() => mcpOauthClients.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    resource: text('resource'),
    scope: text('scope'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenIdx: index('mcp_oauth_refresh_tokens_token_idx').on(table.tokenId),
  })
);
