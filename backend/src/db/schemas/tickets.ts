import { date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { workspaces } from './workspaces';

export const ticketBoards = pgTable('ticket_boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull().default('Untitled board'),
  description: text('description'),
  nextNumber: integer('next_number').notNull().default(1),
  position: integer('position').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ticketStatuses = pgTable('ticket_statuses', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id')
    .notNull()
    .references(() => ticketBoards.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('gray'),
  category: text('category').notNull().default('todo'),
  position: integer('position').notNull().default(0),
});

export const ticketGroups = pgTable('ticket_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id')
    .notNull()
    .references(() => ticketBoards.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('blue'),
  position: integer('position').notNull().default(0),
});

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => ticketBoards.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => ticketGroups.id, { onDelete: 'restrict' }),
    statusId: uuid('status_id')
      .notNull()
      .references(() => ticketStatuses.id, { onDelete: 'restrict' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    priority: text('priority').notNull().default('none'),
    dueDate: date('due_date', { mode: 'string' }),
    labels: text('labels').array().notNull().default([]),
    position: integer('position').notNull().default(0),
    statusPosition: integer('status_position').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    searchText: text('search_text').notNull().default(''),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    groupPositionIdx: index('tickets_group_position_idx').on(table.groupId, table.position),
    statusPositionIdx: index('tickets_status_position_idx').on(table.statusId, table.statusPosition),
  })
);

export const ticketAssignees = pgTable(
  'ticket_assignees',
  {
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ name: 'ticket_assignees_pk', columns: [table.ticketId, table.userId] }),
  })
);

export const ticketComments = pgTable('ticket_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ticketActivity = pgTable('ticket_activity', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  type: text('type').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
