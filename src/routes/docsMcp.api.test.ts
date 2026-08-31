import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool } from '../db';
import { runPendingMigrations } from '../db/migrationRunner';
import { db } from '../db';

const stamp = Date.now();
const ownerEmail = `phase6-docs-mcp-${stamp}@example.com`;
const otherEmail = `phase6-docs-mcp-other-${stamp}@example.com`;
const password = 'password12';

function parseMcpBody(body: unknown): Record<string, unknown> {
  if (typeof body === 'object' && body !== null) {
    return body as Record<string, unknown>;
  }
  if (typeof body === 'string') {
    const dataLine = body.split('\n').find((line) => line.startsWith('data: '));
    if (dataLine) {
      return JSON.parse(dataLine.slice('data: '.length)) as Record<string, unknown>;
    }
    return JSON.parse(body) as Record<string, unknown>;
  }
  throw new Error(`Unexpected MCP body type: ${typeof body}`);
}

async function mcpPost(app: Express, secret: string, payload: Record<string, unknown>) {
  return request(app)
    .post('/mcp')
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json, text/event-stream')
    .set('Authorization', `Bearer ${secret}`)
    .send(payload);
}

function toolResult(res: request.Response): Record<string, unknown> {
  const body = parseMcpBody(res.body?.result ? res.body : res.text);
  const result = (body.result ?? body) as { content?: Array<{ text?: string }> };
  const text = result.content?.[0]?.text;
  if (!text) return body;
  return JSON.parse(text) as Record<string, unknown>;
}

describe('docs MCP protocol', () => {
  let app: Express;
  let dbReady = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      await runPendingMigrations(db, pool);
      dbReady = true;
    } catch (error) {
      console.warn('Skipping docs MCP tests: database unavailable', error);
    }
    process.env.MCP_API_KEY ??= 'test-mcp-api-key';
    app = await createApp();
  });

  it('rejects missing token, then read/write/edit/move/delete within the allowlist', async () => {
    const unauth = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(unauth.status).toBe(401);

    if (!dbReady) return;

    const owner = await request(app).post('/api/auth/register').send({ email: ownerEmail, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;

    const other = await request(app).post('/api/auth/register').send({ email: otherEmail, password });
    const otherJwt = other.body.data.tokens.accessToken as string;
    const otherWs = other.body.data.workspace.id as string;

    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'agent' });
    const secret = tokenRes.body.data.token.secret as string;

    const emptyWs = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'list_workspaces', arguments: {} },
    });
    expect(emptyWs.status).toBe(200);
    expect((toolResult(emptyWs).data as unknown[]).length).toBe(0);

    await request(app)
      .put('/api/mcp/access')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });

    const init = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'dira-tests', version: '1.0.0' },
      },
    });
    expect(init.status).toBe(200);

    const listed = await mcpPost(app, secret, { jsonrpc: '2.0', id: 3, method: 'tools/list' });
    const listedBody = parseMcpBody(listed.body?.result ? listed.body : listed.text);
    const tools = ((listedBody.result as { tools?: Array<{ name: string }> } | undefined)?.tools ??
      (listedBody as { tools?: Array<{ name: string }> }).tools) as Array<{ name: string }>;
    expect(tools.some((tool) => tool.name === 'write_file')).toBe(true);
    expect(tools.some((tool) => tool.name === 'pg_select')).toBe(false);

    const written = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: {
          workspaceId,
          path: 'docs/api/auth.md',
          content: '# Auth\n\nUse tokens.\n',
        },
      },
    });
    const writePayload = toolResult(written);
    expect(writePayload.success).toBe(true);

    const read = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { workspaceId, path: 'docs/api/auth.md' } },
    });
    const readPayload = toolResult(read);
    expect((readPayload.data as { content: string }).content).toContain('# Auth');
    const hash = (readPayload.data as { hash: string }).hash;

    const edited = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'edit_file',
        arguments: {
          workspaceId,
          path: 'docs/api/auth.md',
          oldString: 'Use tokens.',
          newString: 'Use PATs.',
          hash,
        },
      },
    });
    expect(toolResult(edited).success).toBe(true);

    const stale = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'edit_file',
        arguments: {
          workspaceId,
          path: 'docs/api/auth.md',
          oldString: 'Use PATs.',
          newString: 'clobber',
          hash,
        },
      },
    });
    expect(toolResult(stale).success).toBe(false);

    const moved = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'move',
        arguments: { workspaceId, path: 'docs/api/auth.md', parentPath: 'docs' },
      },
    });
    expect(toolResult(moved).success).toBe(true);

    const cross = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: { workspaceId: otherWs, path: 'stolen.md', content: 'nope' },
      },
    });
    expect(toolResult(cross).success).toBe(false);

    const otherToken = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${otherJwt}`)
      .send({ name: 'other' });
    const otherSecret = otherToken.body.data.token.secret as string;
    const otherWrite = await mcpPost(app, otherSecret, {
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'list_tree', arguments: { workspaceId } },
    });
    expect(toolResult(otherWrite).success).toBe(false);

    await request(app)
      .delete(`/api/mcp/tokens/${tokenRes.body.data.token.id}`)
      .set('Authorization', `Bearer ${jwt}`);
    const revoked = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 11,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'x', version: '1' } },
    });
    expect(revoked.status).toBe(401);
  });

  it('resolves optional workspace, search snippets, prefix tree, and sliced reads', async () => {
    if (!dbReady) return;

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase8-mcp-${stamp}@example.com`, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;

    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'agent-ux' });
    const secret = tokenRes.body.data.token.secret as string;

    await request(app)
      .put('/api/mcp/access')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });

    const listed = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/call',
      params: { name: 'list_workspaces', arguments: {} },
    });
    const listedData = toolResult(listed).data as Array<{
      workspaceId: string;
      slug: string;
      default: boolean;
    }>;
    expect(listedData).toHaveLength(1);
    expect(listedData[0].default).toBe(true);
    expect(listedData[0].slug).toBe('my-workspace');

    const written = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: {
          path: 'docs/api/auth.md',
          content: '# Auth\n\nUse zyxxysearchtoken in the header.\nline3\nline4\nline5\n',
        },
      },
    });
    const writeData = toolResult(written).data as { url?: string };
    expect(toolResult(written).success).toBe(true);
    expect(writeData.url).toContain(`/w/${workspaceId}/p/`);

    await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 22,
      method: 'tools/call',
      params: { name: 'write_file', arguments: { path: 'sibling.md', content: '# Other\n' } },
    });

    const omitted = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 23,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: 'docs/api/auth.md' } },
    });
    expect(toolResult(omitted).success).toBe(true);
    expect((toolResult(omitted).data as { content: string }).content).toContain('zyxxysearchtoken');
    expect((toolResult(omitted).data as { url: string }).url).toContain(`/p/`);

    const sliced = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 24,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: 'docs/api/auth.md', maxLines: 2 } },
    });
    const sliceData = toolResult(sliced).data as { content: string; totalLines: number };
    expect(sliceData.content.split('\n')).toHaveLength(2);
    expect(sliceData.totalLines).toBeGreaterThan(2);
    expect(sliceData.content).not.toContain('line5');

    const searched = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 25,
      method: 'tools/call',
      params: { name: 'search_docs', arguments: { q: 'zyxxysearchtoken' } },
    });
    const hits = toolResult(searched).data as Array<{ snippet: string; path: string }>;
    expect(hits.some((hit) => hit.path === 'docs/api/auth.md' && hit.snippet.includes('zyxxysearchtoken'))).toBe(
      true
    );

    const tree = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 26,
      method: 'tools/call',
      params: { name: 'list_tree', arguments: { prefix: 'docs' } },
    });
    const nodes = toolResult(tree).data as Array<{ path: string }>;
    expect(nodes.some((node) => node.path === 'sibling.md')).toBe(false);
    expect(nodes.some((node) => node.path.startsWith('docs'))).toBe(true);

    const second = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'Acme Docs' });
    expect(second.status).toBe(201);
    const acmeId = second.body.data.workspace.id as string;
    await request(app)
      .put('/api/mcp/access')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        workspaces: [
          { workspaceId, canWrite: true },
          { workspaceId: acmeId, canWrite: true },
        ],
      });

    const missing = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 27,
      method: 'tools/call',
      params: { name: 'write_file', arguments: { path: 'nope.md', content: 'x' } },
    });
    expect(toolResult(missing).success).toBe(false);
    expect(toolResult(missing).error).toBe('WORKSPACE_REQUIRED');

    const bySlug = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 28,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: { workspace: 'acme-docs', path: 'readme.md', content: '# Acme\n' },
      },
    });
    expect(toolResult(bySlug).success).toBe(true);

    const guide = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 29,
      method: 'tools/call',
      params: { name: 'dira_guide', arguments: {} },
    });
    expect((toolResult(guide).data as { instructions: string }).instructions).toContain('search_docs');
  });
});
