import { customType, bigint, bigserial, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pages } from './pages';
import { workspaces } from './workspaces';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    return Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
  },
});

export const docUpdates = pgTable('doc_updates', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  docId: uuid('doc_id')
    .notNull()
    .references(() => pages.id, { onDelete: 'cascade' }),
  update: bytea('update').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const docSnapshots = pgTable('doc_snapshots', {
  docId: uuid('doc_id')
    .primaryKey()
    .references(() => pages.id, { onDelete: 'cascade' }),
  snapshot: bytea('snapshot').notNull(),
  updateClock: bigint('update_clock', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const docRevisions = pgTable('doc_revisions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  docId: uuid('doc_id')
    .notNull()
    .references(() => pages.id, { onDelete: 'cascade' }),
  snapshot: bytea('snapshot').notNull(),
  updateClock: bigint('update_clock', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const blobs = pgTable('blobs', {
  id: text('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  contentHash: text('content_hash').notNull(),
  mime: text('mime').notNull(),
  byteSize: integer('byte_size').notNull(),
  storageKey: text('storage_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
