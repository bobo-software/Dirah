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
      .put(`/api/mcp/tokens/${tokenRes.body.data.token.id}/access`)
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
      .put(`/api/mcp/tokens/${tokenRes.body.data.token.id}/access`)
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
      .put(`/api/mcp/tokens/${tokenRes.body.data.token.id}/access`)
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
    const missingResult = toolResult(missing);
    expect(missingResult.message).toContain('my-workspace');
    expect(missingResult.message).toContain('acme-docs');
    expect((missingResult.details as { candidates: string[] }).candidates).toEqual(
      expect.arrayContaining(['my-workspace', 'acme-docs'])
    );

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
    const guideData = toolResult(guide).data as {
      instructions: string;
      workspaces: Array<{ slug: string; startAt: string | null; default: boolean }>;
    };
    expect(guideData.instructions).toContain('search_docs');
    expect(guideData.instructions).toContain('my-workspace');
    expect(guideData.instructions).toContain('acme-docs');
    const acmeEntry = guideData.workspaces.find((ws) => ws.slug === 'acme-docs');
    expect(acmeEntry?.startAt).toBe('readme.md');
    const myWorkspaceEntry = guideData.workspaces.find((ws) => ws.slug === 'my-workspace');
    expect(myWorkspaceEntry?.startAt).toBeNull();

    const init = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 30,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'dira-tests', version: '1.0.0' },
      },
    });
    const initBody = parseMcpBody(init.body?.result ? init.body : init.text);
    const initResult = (initBody.result ?? initBody) as { instructions?: string };
    expect(initResult.instructions).toContain('acme-docs');
  });

  it('resolves an omitted workspace via the token default when multiple are allowlisted', async () => {
    if (!dbReady) return;

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase8-default-ws-mcp-${stamp}@example.com`, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;

    const second = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'Second Workspace' });
    const secondId = second.body.data.workspace.id as string;

    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        name: 'agent-default',
        defaultWorkspaceId: secondId,
        workspaceAccess: [
          { workspaceId, canWrite: true },
          { workspaceId: secondId, canWrite: true },
        ],
      });
    const secret = tokenRes.body.data.token.secret as string;

    const written = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 30,
      method: 'tools/call',
      params: { name: 'write_file', arguments: { path: 'via-default.md', content: '# Default\n' } },
    });
    const writeData = toolResult(written).data as { url: string };
    expect(toolResult(written).success).toBe(true);
    expect(writeData.url).toContain(`/w/${secondId}/p/`);

    const read = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 31,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: 'via-default.md' } },
    });
    expect((toolResult(read).data as { content: string }).content).toContain('# Default');
  });

  it('search_docs accepts query as an alias for q, boosts readme.md, and surfaces frontmatter', async () => {
    if (!dbReady) return;

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase8-search-${stamp}@example.com`, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;
    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'agent-search' });
    const secret = tokenRes.body.data.token.secret as string;
    await request(app)
      .put(`/api/mcp/tokens/${tokenRes.body.data.token.id}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });

    await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 40,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: {
          path: 'docs/deep/conventions.md',
          content: '# Conventions\n\nzzflavortoken guidance lives here.\n',
        },
      },
    });
    await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: {
          path: 'readme.md',
          content:
            '---\nwhen: looking for zzflavortoken guidance\ntopics: [rest, conventions]\nrepos: [schoolos-backend]\n---\n# Readme\n\nzzflavortoken pointer.\n',
        },
      },
    });

    const byQuery = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: { name: 'search_docs', arguments: { query: 'zzflavortoken' } },
    });
    const hits = toolResult(byQuery).data as Array<{
      path: string;
      readWhen: string | null;
      topics?: string[];
      repos?: string[];
    }>;
    expect(toolResult(byQuery).success).toBe(true);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0].path).toBe('readme.md');
    expect(hits[0].readWhen).toBe('looking for zzflavortoken guidance');
    expect(hits[0].topics).toEqual(['rest', 'conventions']);
    expect(hits[0].repos).toEqual(['schoolos-backend']);
    const otherHit = hits.find((hit) => hit.path === 'docs/deep/conventions.md');
    expect(otherHit?.readWhen).toBe('Conventions');

    const neitherArg = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 43,
      method: 'tools/call',
      params: { name: 'search_docs', arguments: {} },
    });
    expect(toolResult(neitherArg).success).toBe(false);
  });

  it('edit_file refuses ambiguous oldString and applies replaceAll; HASH_MISMATCH carries a diff hint', async () => {
    if (!dbReady) return;

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase8-edit-${stamp}@example.com`, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;
    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'agent-edit' });
    const secret = tokenRes.body.data.token.secret as string;
    await request(app)
      .put(`/api/mcp/tokens/${tokenRes.body.data.token.id}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });

    await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 50,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: { path: 'dup.md', content: 'foo bar\nfoo baz\n' },
      },
    });

    const ambiguous = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 51,
      method: 'tools/call',
      params: {
        name: 'edit_file',
        arguments: { path: 'dup.md', oldString: 'foo', newString: 'qux' },
      },
    });
    const ambiguousResult = toolResult(ambiguous);
    expect(ambiguousResult.success).toBe(false);
    expect(ambiguousResult.error).toBe('PATCH_AMBIGUOUS');
    expect((ambiguousResult.details as { occurrences: number }).occurrences).toBe(2);

    const replaced = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 52,
      method: 'tools/call',
      params: {
        name: 'edit_file',
        arguments: { path: 'dup.md', oldString: 'foo', newString: 'qux', replaceAll: true },
      },
    });
    expect(toolResult(replaced).success).toBe(true);

    const readBack = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 53,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: 'dup.md' } },
    });
    const readData = toolResult(readBack).data as { content: string; hash: string };
    expect(readData.content).toBe('qux bar\nqux baz\n');

    const stale = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 54,
      method: 'tools/call',
      params: {
        name: 'edit_file',
        arguments: { path: 'dup.md', oldString: 'qux bar', newString: 'clobber', hash: 'stale-hash' },
      },
    });
    const staleResult = toolResult(stale);
    expect(staleResult.success).toBe(false);
    expect(staleResult.error).toBe('HASH_MISMATCH');
    const staleDetails = staleResult.details as { currentHash: string; diffPreview: string; hint: string };
    expect(staleDetails.currentHash).toBe(readData.hash);
    expect(staleDetails.diffPreview).toContain('qux bar');
    expect(staleDetails.hint).toContain('read_file');
  });

  it('list_tree sorts by path, defaults depth to 2, supports a kind filter, and surfaces headings', async () => {
    if (!dbReady) return;

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase8-tree-${stamp}@example.com`, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;
    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'agent-tree' });
    const secret = tokenRes.body.data.token.secret as string;
    await request(app)
      .put(`/api/mcp/tokens/${tokenRes.body.data.token.id}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });

    for (const [path, content] of [
      ['zeta.md', '# Zeta Heading\n\nBody.\n'],
      ['alpha.md', '# Alpha Heading\n\nBody.\n'],
      ['b/c.md', '# C Heading\n\nBody.\n'],
      ['b/d/e.md', '# E Heading\n\nBody.\n'],
    ] as const) {
      await mcpPost(app, secret, {
        jsonrpc: '2.0',
        id: 60,
        method: 'tools/call',
        params: { name: 'write_file', arguments: { path, content } },
      });
    }

    const tree = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 61,
      method: 'tools/call',
      params: { name: 'list_tree', arguments: {} },
    });
    const nodes = toolResult(tree).data as Array<{ path: string; kind: string; heading?: string }>;
    // b/d/e.md is at depth 3 and should be excluded by the default depth of 2.
    expect(nodes.some((node) => node.path === 'b/d/e.md')).toBe(false);
    const paths = nodes.map((node) => node.path);
    expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)));
    const alpha = nodes.find((node) => node.path === 'alpha.md');
    expect(alpha?.heading).toBe('Alpha Heading');

    const deep = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 62,
      method: 'tools/call',
      params: { name: 'list_tree', arguments: { depth: 5 } },
    });
    const deepNodes = toolResult(deep).data as Array<{ path: string }>;
    expect(deepNodes.some((node) => node.path === 'b/d/e.md')).toBe(true);

    const foldersOnly = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 63,
      method: 'tools/call',
      params: { name: 'list_tree', arguments: { kind: 'folder', depth: 5 } },
    });
    const folderNodes = toolResult(foldersOnly).data as Array<{ path: string; kind: string }>;
    expect(folderNodes.every((node) => node.kind === 'folder')).toBe(true);
    expect(folderNodes.some((node) => node.path === 'b')).toBe(true);
  });

  it('exposes dira://guide and per-workspace readme resources', async () => {
    if (!dbReady) return;

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase8-resources-${stamp}@example.com`, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;
    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'agent-resources' });
    const secret = tokenRes.body.data.token.secret as string;
    await request(app)
      .put(`/api/mcp/tokens/${tokenRes.body.data.token.id}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });

    await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 70,
      method: 'tools/call',
      params: { name: 'write_file', arguments: { path: 'readme.md', content: '# Readme\n\nHello.\n' } },
    });

    const list = await mcpPost(app, secret, { jsonrpc: '2.0', id: 71, method: 'resources/list', params: {} });
    const listBody = parseMcpBody(list.body?.result ? list.body : list.text);
    const listResult = (listBody.result ?? listBody) as { resources: Array<{ uri: string }> };
    expect(listResult.resources.some((r) => r.uri === 'dira://guide')).toBe(true);
    expect(listResult.resources.some((r) => r.uri === 'dira://my-workspace/readme.md')).toBe(true);

    const guideRead = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 72,
      method: 'resources/read',
      params: { uri: 'dira://guide' },
    });
    const guideBody = parseMcpBody(guideRead.body?.result ? guideRead.body : guideRead.text);
    const guideResult = (guideBody.result ?? guideBody) as { contents: Array<{ text: string }> };
    expect(guideResult.contents[0].text).toContain('my-workspace');

    const docRead = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 73,
      method: 'resources/read',
      params: { uri: 'dira://my-workspace/readme.md' },
    });
    const docBody = parseMcpBody(docRead.body?.result ? docRead.body : docRead.text);
    const docResult = (docBody.result ?? docBody) as { contents: Array<{ text: string }> };
    expect(docResult.contents[0].text).toContain('# Readme');
  });

  it('resolves an unambiguous path across workspaces without workspace, and rejects a colliding one', async () => {
    if (!dbReady) return;

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase8-path-resolve-${stamp}@example.com`, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;
    const second = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'Second Path Workspace' });
    const secondId = second.body.data.workspace.id as string;
    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'agent-path-resolve' });
    const secret = tokenRes.body.data.token.secret as string;
    await request(app)
      .put(`/api/mcp/tokens/${tokenRes.body.data.token.id}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        workspaces: [
          { workspaceId, canWrite: true },
          { workspaceId: secondId, canWrite: true },
        ],
      });

    await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 80,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: { workspaceId, path: 'docs/backend/conventions.md', content: '# Conventions\n' },
      },
    });

    const uniqueRead = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 81,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: 'docs/backend/conventions.md' } },
    });
    expect(toolResult(uniqueRead).success).toBe(true);
    expect((toolResult(uniqueRead).data as { content: string }).content).toContain('# Conventions');

    await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 82,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: { workspaceId: secondId, path: 'docs/backend/conventions.md', content: '# Other\n' },
      },
    });

    const ambiguousRead = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 83,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: 'docs/backend/conventions.md' } },
    });
    const ambiguousResult = toolResult(ambiguousRead);
    expect(ambiguousResult.success).toBe(false);
    expect(ambiguousResult.error).toBe('PATH_AMBIGUOUS');
    expect((ambiguousResult.details as { candidates: string[] }).candidates).toHaveLength(2);

    const notFound = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 84,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: 'nowhere.md' } },
    });
    const notFoundResult = toolResult(notFound);
    expect(notFoundResult.success).toBe(false);
    expect(notFoundResult.error).toBe('DOCS_NOT_FOUND');
  });

  it('warns about dangling markdown links on write without failing the write', async () => {
    if (!dbReady) return;

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase8-links-${stamp}@example.com`, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;
    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'agent-links' });
    const secret = tokenRes.body.data.token.secret as string;
    await request(app)
      .put(`/api/mcp/tokens/${tokenRes.body.data.token.id}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });

    await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 90,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: { path: 'docs/plans/foo.md', content: '# Foo\n' },
      },
    });

    const withDangling = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 91,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: {
          path: 'docs/plans/bar.md',
          content: '# Bar\n\nSee [missing](nope.md) and [foo](foo.md).\n',
        },
      },
    });
    const withDanglingResult = toolResult(withDangling);
    expect(withDanglingResult.success).toBe(true);
    const warnings = (withDanglingResult.data as { warnings?: string[] }).warnings ?? [];
    expect(warnings.some((w) => w.includes('nope.md'))).toBe(true);
    expect(warnings.some((w) => w.includes('foo.md'))).toBe(false);

    const clean = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 92,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: { path: 'docs/plans/baz.md', content: '# Baz\n\nSee [foo](foo.md).\n' },
      },
    });
    const cleanResult = toolResult(clean);
    expect(cleanResult.success).toBe(true);
    expect((cleanResult.data as { warnings?: string[] }).warnings).toBeUndefined();
  });

  it('grants are per-token: token A cannot reach a workspace only granted to token B', async () => {
    if (!dbReady) return;

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase-per-token-mcp-${stamp}@example.com`, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspace1 = owner.body.data.workspace.id as string;

    const secondWs = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'Per Token Workspace 2' });
    const workspace2 = secondWs.body.data.workspace.id as string;

    const tokenARes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'token-a' });
    const secretA = tokenARes.body.data.token.secret as string;
    await request(app)
      .put(`/api/mcp/tokens/${tokenARes.body.data.token.id}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId: workspace1, canWrite: true }] });

    const tokenBRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'token-b' });
    const secretB = tokenBRes.body.data.token.secret as string;
    await request(app)
      .put(`/api/mcp/tokens/${tokenBRes.body.data.token.id}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId: workspace2, canWrite: true }] });

    // Token A, granted only workspace1, must be rejected against workspace2.
    const aAgainstB = await mcpPost(app, secretA, {
      jsonrpc: '2.0',
      id: 100,
      method: 'tools/call',
      params: { name: 'list_tree', arguments: { workspaceId: workspace2 } },
    });
    const aAgainstBResult = toolResult(aAgainstB);
    expect(aAgainstBResult.success).toBe(false);
    expect(aAgainstBResult.error).toBe('MCP_NOT_ALLOWLISTED');

    // And the reverse: token B, granted only workspace2, must be rejected against workspace1.
    const bAgainstA = await mcpPost(app, secretB, {
      jsonrpc: '2.0',
      id: 101,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { workspaceId: workspace1, path: 'anything.md' } },
    });
    const bAgainstAResult = toolResult(bAgainstA);
    expect(bAgainstAResult.success).toBe(false);
    expect(bAgainstAResult.error).toBe('MCP_NOT_ALLOWLISTED');

    // Sanity: each token still works fine against its own granted workspace.
    const aAgainstOwn = await mcpPost(app, secretA, {
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/call',
      params: { name: 'list_tree', arguments: { workspaceId: workspace1 } },
    });
    expect(toolResult(aAgainstOwn).success).toBe(true);
  });

  it('a read-only token grant allows reads but rejects writes with MCP_READ_ONLY', async () => {
    if (!dbReady) return;

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase-readonly-mcp-${stamp}@example.com`, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;

    // Seed a file with a writable token first so there's something to read.
    const seedToken = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'seed-token' });
    const seedSecret = seedToken.body.data.token.secret as string;
    await request(app)
      .put(`/api/mcp/tokens/${seedToken.body.data.token.id}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });
    await mcpPost(app, seedSecret, {
      jsonrpc: '2.0',
      id: 110,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: { workspaceId, path: 'readonly-check.md', content: '# Read only\n' },
      },
    });

    const readOnlyToken = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'readonly-token' });
    const readOnlySecret = readOnlyToken.body.data.token.secret as string;
    await request(app)
      .put(`/api/mcp/tokens/${readOnlyToken.body.data.token.id}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId, canWrite: false }] });

    const read = await mcpPost(app, readOnlySecret, {
      jsonrpc: '2.0',
      id: 111,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { workspaceId, path: 'readonly-check.md' } },
    });
    expect(toolResult(read).success).toBe(true);

    const listTree = await mcpPost(app, readOnlySecret, {
      jsonrpc: '2.0',
      id: 112,
      method: 'tools/call',
      params: { name: 'list_tree', arguments: { workspaceId } },
    });
    expect(toolResult(listTree).success).toBe(true);

    const write = await mcpPost(app, readOnlySecret, {
      jsonrpc: '2.0',
      id: 113,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: { workspaceId, path: 'readonly-check.md', content: '# Changed\n' },
      },
    });
    const writeResult = toolResult(write);
    expect(writeResult.success).toBe(false);
    expect(writeResult.error).toBe('MCP_READ_ONLY');
  });
});
