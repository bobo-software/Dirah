import express, { json } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged: unknown[] = [];
vi.mock('../db', () => ({
  db: {
    insert: () => ({
      values: (row: unknown) => {
        logged.push(row);
        return Promise.resolve();
      },
    }),
  },
}));

const { errorHandler } = await import('./errorHandler');
const { HttpError } = await import('../utils/HttpError');
const { toPublicError, toolError } = await import('../utils/publicError');

function pgError() {
  return Object.assign(new Error('duplicate key value violates unique constraint "users_email_unique"'), {
    code: '23505',
    table: 'users',
    constraint: 'users_email_unique',
  });
}

function appThrowing(error: unknown) {
  const app = express();
  app.use(json());
  app.post('/boom', () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  beforeEach(() => {
    logged.length = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('hides a database error behind INTERNAL_ERROR and a request id', async () => {
    const res = await request(appThrowing(pgError())).post('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      message: 'Internal server error',
      error: 'INTERNAL_ERROR',
      requestId: expect.any(String),
    });
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
    for (const leak of ['users_email_unique', 'users', '23505', 'duplicate key']) {
      expect(res.text).not.toContain(leak);
    }

    await new Promise((resolve) => setImmediate(resolve));
    expect(JSON.stringify(logged)).not.toContain('users_email_unique');
    const realLog = vi.mocked(console.error).mock.calls.find((call) => call[0] === `[error ${res.body.requestId}]`);
    expect(realLog?.[1]).toBeInstanceOf(Error);
  });

  it('keeps the message and code of an HttpError', async () => {
    const res = await request(appThrowing(new HttpError('Nope', 409, 'CONFLICT'))).post('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, message: 'Nope', error: 'CONFLICT' });
    expect(res.headers['x-request-id']).toBeUndefined();
  });

  it('keeps a deliberate 5xx HttpError', async () => {
    const res = await request(appThrowing(new HttpError('Provider is down', 502, 'OAUTH_PROVIDER'))).post('/boom');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('OAUTH_PROVIDER');
  });

  it('keeps body-parser 4xx errors', async () => {
    const app = appThrowing(new Error('unused'));
    const res = await request(app).post('/boom').set('Content-Type', 'application/json').send('{"bad json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('entity.parse.failed');
  });
});

describe('toPublicError', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('passes HttpError through', () => {
    expect(toPublicError(new HttpError('Gone', 404, 'NOT_FOUND', { id: 'x' }))).toEqual({
      status: 404,
      message: 'Gone',
      code: 'NOT_FOUND',
      details: { id: 'x' },
    });
  });

  it('hides anything unexpected, including non-Error throws', () => {
    for (const thrown of [pgError(), 'boom', null, Object.assign(new Error('bad'), { status: 503 })]) {
      const result = toPublicError(thrown);
      expect(result).toMatchObject({ status: 500, message: 'Internal server error', code: 'INTERNAL_ERROR' });
      expect(result.requestId).toEqual(expect.any(String));
    }
  });

  it('gives MCP tools the request id in details', () => {
    const result = toolError(pgError());
    expect(result).toEqual({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: { requestId: expect.any(String) },
    });
    expect(JSON.stringify(result)).not.toContain('users_email_unique');
    expect(toolError(new HttpError('Read only', 403, 'MCP_READ_ONLY'))).toEqual({
      message: 'Read only',
      code: 'MCP_READ_ONLY',
      details: undefined,
    });
  });
});
