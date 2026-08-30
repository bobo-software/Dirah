import { pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pages } from './pages';
import { users } from './users';

export const pageFavorites = pgTable(
  'page_favorites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.pageId] }),
  })
);
