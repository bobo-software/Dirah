import { type AnyPgColumn, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';

export const pages = pgTable('pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('Untitled'),
  parentId: uuid('parent_id').references((): AnyPgColumn => pages.id, { onDelete: 'set null' }),
  position: integer('position').notNull().default(0),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  status: text('status').notNull().default(''),
  kind: text('kind').notNull().default('page'),
  slug: text('slug'),
  searchText: text('search_text').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
