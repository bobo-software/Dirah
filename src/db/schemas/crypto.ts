import { integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { workspaces } from './workspaces';

export const userCrypto = pgTable('user_crypto', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(),
  wrappedPrivateKey: text('wrapped_private_key').notNull(),
  kdfSalt: text('kdf_salt').notNull(),
  kdfIterations: integer('kdf_iterations').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMemberKeys = pgTable(
  'workspace_member_keys',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    wrappedDek: text('wrapped_dek').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.userId], name: 'workspace_member_keys_pk' }),
  })
);
