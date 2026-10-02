import { type AnyPgColumn, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { workspaces } from './workspaces';

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): AnyPgColumn => notes.id, { onDelete: 'set null' }),
  title: text('title').notNull().default('Untitled'),
  icon: text('icon'),
  cover: text('cover'),
  visibility: text('visibility').notNull().default('private'),
  kind: text('kind').notNull().default('note'),
  position: integer('position').notNull().default(0),
  pinnedAt: timestamp('pinned_at', { withTimezone: true }),
  content: text('content').notNull().default(''),
  contentHash: text('content_hash').notNull(),
  searchText: text('search_text').notNull().default(''),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const kanbanColumns = pgTable('kanban_columns', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id')
    .notNull()
    .references(() => notes.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('Untitled'),
  position: integer('position').notNull().default(0),
});

export const kanbanCards = pgTable(
  'kanban_cards',
  {
    boardId: uuid('board_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    columnId: uuid('column_id')
      .notNull()
      .references(() => kanbanColumns.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.boardId, table.noteId] }),
  })
);

export const noteTags = pgTable('note_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const noteTagLinks = pgTable(
  'note_tag_links',
  {
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => noteTags.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.noteId, table.tagId] }),
  })
);
