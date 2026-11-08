import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { PgMcpService, type PgAuditEvent } from './PgMcpService';

function fakePool(rows: unknown[] = []): Pool {
  const query = vi.fn(async () => ({ rows, rowCount: rows.length }));
  return {
    connect: vi.fn(async () => ({ query, release: vi.fn() })),
  } as unknown as Pool;
}

function collect() {
  const events: PgAuditEvent[] = [];
  return { events, audit: (event: PgAuditEvent) => { events.push(event); } };
}

describe('PgMcpService audit', () => {
  it('records a successful tool call', async () => {
    const { events, audit } = collect();
    const service = new PgMcpService({
      pool: fakePool([{ table_name: 'users' }]),
      database: 'dirah',
      audit,
    });

    const result = await service.listTables();

    expect(result.success).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tool: 'pg_list_tables',
      database: 'dirah',
      outcome: 'ok',
    });
  });

  it('records the statement kind and a hash, never the SQL', async () => {
    const { events, audit } = collect();
    const service = new PgMcpService({ pool: fakePool(), database: 'dirah', audit });

    await service.executeWrite('UPDATE users SET name = $1 WHERE id = $2', {
      confirm: true,
      params: ['Ada', 'user-1'],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tool: 'pg_execute_write',
      outcome: 'ok',
      statementKind: 'update',
    });
    expect(events[0].sqlHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(events[0])).not.toContain('UPDATE users');
  });

  it('records guard failures with an error code', async () => {
    const { events, audit } = collect();
    const service = new PgMcpService({ pool: fakePool(), database: 'dirah', audit });

    const result = await service.executeWrite('DELETE FROM users', { confirm: true });

    expect(result.success).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tool: 'pg_execute_write',
      outcome: 'error',
      errorCode: 'SQL_GUARD',
    });
  });

  it('does not break the tool when the audit sink fails', async () => {
    const service = new PgMcpService({
      pool: fakePool([{ table_name: 'users' }]),
      database: 'dirah',
      audit: () => {
        throw new Error('audit down');
      },
    });

    const result = await service.listTables();

    expect(result.success).toBe(true);
  });
});
