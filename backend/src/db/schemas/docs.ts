import { bigint, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';

export const blobs = pgTable('blobs', {
  id: text('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  contentHash: text('content_hash').notNull(),
  mime: text('mime').notNull(),
  byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
  storageKey: text('storage_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
