import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const requestLogs = pgTable(
  'request_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    method: text('method').notNull(),
    url: text('url').notNull(),
    statusCode: integer('status_code').notNull(),
    durationMs: integer('duration_ms').notNull(),
    success: boolean('success').notNull(),
    message: text('message').notNull(),
    userId: uuid('user_id'),
    userRole: text('user_role'),
    ip: text('ip'),
    requestBody: jsonb('request_body'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    createdAtIdx: index('request_logs_created_at_idx').on(table.createdAt),
    statusCodeIdx: index('request_logs_status_code_idx').on(table.statusCode),
  })
);
