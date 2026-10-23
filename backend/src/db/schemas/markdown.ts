import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pages } from './pages';

export const markdownBodies = pgTable('markdown_bodies', {
  pageId: uuid('page_id')
    .primaryKey()
    .references(() => pages.id, { onDelete: 'cascade' }),
  content: text('content').notNull().default(''),
  contentHash: text('content_hash').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
