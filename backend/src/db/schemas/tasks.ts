import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { workspaces } from './workspaces';

export const taskLists = pgTable('task_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('Untitled'),
  icon: text('icon'),
  mode: text('mode').notNull().default('checklist'),
  visibility: text('visibility').notNull().default('private'),
  position: integer('position').notNull().default(0),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const taskListItems = pgTable(
  'task_list_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id')
      .notNull()
      .references(() => taskLists.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    checked: boolean('checked').notNull().default(false),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    checkedBy: uuid('checked_by').references(() => users.id, { onDelete: 'set null' }),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    listPositionIdx: index('task_list_items_list_id_position_idx').on(table.listId, table.position),
  })
);
