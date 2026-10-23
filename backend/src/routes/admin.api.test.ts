import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';

describe('admin test email', () => {
  let app: Express;

  beforeAll(async () => {
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
  });

  it('POST /api/admin/emails/test without a token is 401', async () => {
    const res = await request(app).post('/api/admin/emails/test').send({ to: 'someone@example.com' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/admin/emails/test with a bad token is 401', async () => {
    const res = await request(app)
      .post('/api/admin/emails/test')
      .set('Authorization', 'Bearer not-a-token')
      .send({ to: 'someone@example.com' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
