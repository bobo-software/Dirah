import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReadinessHandler, getHealth } from './health.controller';

function buildApp(probes: Parameters<typeof createReadinessHandler>[0], timeoutMs?: number) {
  const app = express();
  app.get('/health', getHealth);
  app.get('/health/ready', createReadinessHandler(probes, { timeoutMs }));
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /health', () => {
  it('reports liveness without touching dependencies', async () => {
    // Any dependency call would show up here and fail the test.
    const database = vi.fn();
    const storage = vi.fn();
    const res = await request(buildApp({ database, storage })).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(typeof res.body.data.uptime).toBe('number');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(database).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
});

describe('GET /health/ready', () => {
  it('is ready when the database and storage answer', async () => {
    const res = await request(
      buildApp({ database: async () => undefined, storage: async () => undefined })
    ).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.checks.database).toMatchObject({ status: 'up' });
    expect(res.body.data.checks.storage).toMatchObject({ status: 'up' });
    expect(typeof res.body.data.checks.database.latencyMs).toBe('number');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('is not ready, with a per-check result, when the database fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await request(
      buildApp({
        database: async () => {
          throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
        },
        storage: async () => undefined,
      })
    ).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.status).toBe('not_ready');
    expect(res.body.data.checks.database).toMatchObject({
      status: 'down',
      error: 'probe_failed',
    });
    expect(res.body.data.checks.storage).toMatchObject({ status: 'up' });
    expect(warn).toHaveBeenCalled();
  });

  it('does not leak dependency error text', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await request(
      buildApp({
        database: async () => {
          throw new Error('password=hunter2 host=db.internal');
        },
        storage: async () => undefined,
      })
    ).get('/health/ready');

    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(JSON.stringify(res.body)).not.toContain('db.internal');
    expect(res.body.data.checks.database.error).toBe('probe_failed');
  });

  it('times out a probe that never answers', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await request(
      buildApp(
        {
          database: () => new Promise(() => undefined),
          storage: async () => undefined,
        },
        10
      )
    ).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.data.checks.database).toMatchObject({
      status: 'down',
      error: 'timeout',
    });
  });
});
