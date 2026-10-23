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
      // Set ALLOW_DB_SKIP=1 to run without Postgres; otherwise a missing database must fail, not pass.
      if (process.env.ALLOW_DB_SKIP !== '1') throw error;
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
        clientInfo: { name: 'dirah-tests', version: '1.0.0' },
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
      params: { name: 'dirah_guide', arguments: {} },
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
        clientInfo: { name: 'dirah-tests', version: '1.0.0' },
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

    const ticketNote = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 44,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: { path: 'docs/pp-b4.md', content: '# PP - B4\n\nTicket body for hyphen folding.\n' },
      },
    });
    expect(toolResult(ticketNote).success).toBe(true);

    for (const [id, q] of [
      [45, 'PP-B4'],
      [46, 'pp-b4'],
      [47, 'PP - B4'],
    ] as const) {
      const found = await mcpPost(app, secret, {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: 'search_docs', arguments: { q } },
      });
      const ticketHits = toolResult(found).data as Array<{ path: string; snippet: string }>;
      const ticketHit = ticketHits.find((hit) => hit.path === 'docs/pp-b4.md');
      expect(ticketHit, `expected hit for query ${q}`).toBeTruthy();
      expect(ticketHit?.snippet).toMatch(/B4/i);
      expect(ticketHit?.snippet).not.toContain('<b>');
    }

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

    const missing = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 55,
      method: 'tools/call',
      params: {
        name: 'edit_file',
        arguments: { path: 'dup.md', oldString: 'this-string-is-not-there', newString: 'x' },
      },
    });
    const missingResult = toolResult(missing);
    expect(missingResult.success).toBe(false);
    expect(missingResult.error).toBe('PATCH_NOT_FOUND');
    const missingDetails = missingResult.details as { currentHash: string; path: string; nearbySnippet: string };
    expect(missingDetails.currentHash).toBe(readData.hash);
    expect(missingDetails.path).toBe('dup.md');
    expect(missingDetails.nearbySnippet).toContain('qux bar');

    const patched = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 56,
      method: 'tools/call',
      params: {
        name: 'edit_file',
        arguments: {
          path: 'dup.md',
          hash: readData.hash,
          patches: [
            { oldString: 'qux bar', newString: 'alpha bar' },
            { oldString: 'qux baz', newString: 'beta baz' },
          ],
        },
      },
    });
    const patchedResult = toolResult(patched);
    expect(patchedResult.success).toBe(true);
    const patchedHash = (patchedResult.data as { hash: string }).hash;

    const appended = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 57,
      method: 'tools/call',
      params: {
        name: 'edit_file',
        arguments: { path: 'dup.md', hash: patchedHash, append: '## End\n' },
      },
    });
    expect(toolResult(appended).success).toBe(true);

    const finalRead = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 58,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: 'dup.md' } },
    });
    expect((toolResult(finalRead).data as { content: string }).content).toBe('alpha bar\nbeta baz\n## End\n');
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

  it('exposes dirah://guide and per-workspace readme resources', async () => {
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
    expect(listResult.resources.some((r) => r.uri === 'dirah://guide')).toBe(true);
    expect(listResult.resources.some((r) => r.uri === 'dirah://my-workspace/readme.md')).toBe(true);

    const guideRead = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 72,
      method: 'resources/read',
      params: { uri: 'dirah://guide' },
    });
    const guideBody = parseMcpBody(guideRead.body?.result ? guideRead.body : guideRead.text);
    const guideResult = (guideBody.result ?? guideBody) as { contents: Array<{ text: string }> };
    expect(guideResult.contents[0].text).toContain('my-workspace');

    const docRead = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 73,
      method: 'resources/read',
      params: { uri: 'dirah://my-workspace/readme.md' },
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

  it('warns when a new docs path is not linked from the agent index', async () => {
    if (!dbReady) return;

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `phase8-index-${stamp}@example.com`, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;
    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'agent-index' });
    const secret = tokenRes.body.data.token.secret as string;
    await request(app)
      .put(`/api/mcp/tokens/${tokenRes.body.data.token.id}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });

    await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 120,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: { path: 'readme.md', content: '# Index\n\n- [Known](docs/known.md)\n' },
      },
    });

    const known = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 121,
      method: 'tools/call',
      params: { name: 'write_file', arguments: { path: 'docs/known.md', content: '# Known\n' } },
    });
    const knownWarnings = (toolResult(known).data as { warnings?: string[] }).warnings ?? [];
    expect(knownWarnings.some((w) => w.includes('not linked'))).toBe(false);

    const orphan = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 122,
      method: 'tools/call',
      params: {
        name: 'write_file',
        arguments: { path: 'docs/testing/unit/foo.md', content: '# Foo tests\n' },
      },
    });
    const orphanWarnings = (toolResult(orphan).data as { warnings?: string[] }).warnings ?? [];
    expect(orphanWarnings.some((w) => w.includes('docs/testing/unit/foo.md') && w.includes('readme.md'))).toBe(
      true
    );
  });

  it('exposes notes with the same visibility as the app, and keeps them out of page search', async () => {
    if (!dbReady) return;

    const ownerEmail = `notes-mcp-owner-${stamp}@example.com`;
    const memberEmail = `notes-mcp-member-${stamp}@example.com`;
    const secretWord = `zebracornnotemcp${stamp}`;

    const owner = await request(app).post('/api/auth/register').send({ email: ownerEmail, password });
    expect(owner.status).toBe(201);
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;

    const member = await request(app).post('/api/auth/register').send({ email: memberEmail, password });
    expect(member.status).toBe(201);
    const memberJwt = member.body.data.tokens.accessToken as string;

    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'notes-agent', workspaceAccess: [{ workspaceId, canWrite: true }] });
    const secret = tokenRes.body.data.token.secret as string;

    const guide = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 200,
      method: 'tools/call',
      params: { name: 'dirah_guide', arguments: {} },
    });
    expect(String((toolResult(guide).data as { instructions: string }).instructions)).toContain('search_notes');

    const parent = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 201,
      method: 'tools/call',
      params: { name: 'write_note', arguments: { title: 'Nest parent' } },
    });
    const parentData = toolResult(parent).data as { id: string; visibility: string; url: string };
    expect(toolResult(parent).success).toBe(true);
    expect(parentData.visibility).toBe('private');
    expect(parentData.url).toContain(`/w/${workspaceId}/n/${parentData.id}`);

    const child = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 202,
      method: 'tools/call',
      params: {
        name: 'write_note',
        arguments: {
          title: 'Nest child',
          parentId: parentData.id,
          content: `# Child\n\n${secretWord} lives here\n`,
        },
      },
    });
    const childData = toolResult(child).data as {
      id: string;
      hash: string;
      breadcrumb: string[];
      editable: boolean;
    };
    expect(toolResult(child).success).toBe(true);
    expect(childData.editable).toBe(true);
    expect(childData.breadcrumb).toEqual(['Nest parent', 'Nest child']);

    const listed = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 203,
      method: 'tools/call',
      params: { name: 'list_notes', arguments: { parentId: parentData.id } },
    });
    const listedRows = toolResult(listed).data as Array<{ id: string }>;
    expect(listedRows.map((row) => row.id)).toEqual([childData.id]);

    const read = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 204,
      method: 'tools/call',
      params: { name: 'read_note', arguments: { noteId: childData.id } },
    });
    const readData = toolResult(read).data as { content: string; hash: string };
    expect(readData.content).toContain(secretWord);

    const edited = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 205,
      method: 'tools/call',
      params: {
        name: 'edit_note',
        arguments: {
          noteId: childData.id,
          oldString: '# Child',
          newString: '# Child revised',
          hash: readData.hash,
        },
      },
    });
    expect(toolResult(edited).success).toBe(true);
    expect((toolResult(edited).data as { content: string }).content).toContain('# Child revised');
    expect((toolResult(edited).data as { content: string }).content).toContain(secretWord);

    const stale = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 206,
      method: 'tools/call',
      params: {
        name: 'write_note',
        arguments: { noteId: childData.id, content: 'overwrite', hash: readData.hash },
      },
    });
    expect(toolResult(stale).success).toBe(false);
    expect(toolResult(stale).error).toBe('HASH_MISMATCH');

    const pageSearch = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 207,
      method: 'tools/call',
      params: { name: 'search_docs', arguments: { q: secretWord } },
    });
    expect(toolResult(pageSearch).success).toBe(true);
    const pageHits = toolResult(pageSearch).data as Array<{ id: string }>;
    expect(pageHits.some((hit) => hit.id === childData.id)).toBe(false);

    const noteSearch = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 208,
      method: 'tools/call',
      params: { name: 'search_notes', arguments: { query: secretWord } },
    });
    const noteHits = toolResult(noteSearch).data as Array<{ id: string; snippet: string }>;
    expect(noteHits.some((hit) => hit.id === childData.id && hit.snippet.includes(secretWord))).toBe(true);

    const invite = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ email: memberEmail, role: 'editor' });
    expect(invite.status).toBe(201);
    const inviteToken = String(invite.body.data.invite.inviteUrl).split('/invite/')[1];
    const accepted = await request(app)
      .post(`/api/invites/${inviteToken}/accept`)
      .set('Authorization', `Bearer ${memberJwt}`);
    expect(accepted.status).toBe(201);

    const memberToken = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${memberJwt}`)
      .send({ name: 'member-notes', workspaceAccess: [{ workspaceId, canWrite: true }] });
    const memberSecret = memberToken.body.data.token.secret as string;

    const hiddenList = await mcpPost(app, memberSecret, {
      jsonrpc: '2.0',
      id: 209,
      method: 'tools/call',
      params: { name: 'list_notes', arguments: { workspaceId } },
    });
    expect(
      (toolResult(hiddenList).data as Array<{ id: string }>).some((row) => row.id === childData.id)
    ).toBe(false);

    const hiddenSearch = await mcpPost(app, memberSecret, {
      jsonrpc: '2.0',
      id: 210,
      method: 'tools/call',
      params: { name: 'search_notes', arguments: { workspaceId, q: secretWord } },
    });
    expect(
      (toolResult(hiddenSearch).data as Array<{ id: string }>).some((row) => row.id === childData.id)
    ).toBe(false);

    const hiddenRead = await mcpPost(app, memberSecret, {
      jsonrpc: '2.0',
      id: 211,
      method: 'tools/call',
      params: { name: 'read_note', arguments: { noteId: childData.id } },
    });
    expect(toolResult(hiddenRead).success).toBe(false);
    expect(toolResult(hiddenRead).error).toBe('NOTE_NOT_FOUND');

    const shared = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 212,
      method: 'tools/call',
      params: {
        name: 'update_note',
        arguments: { noteId: parentData.id, visibility: 'workspace' },
      },
    });
    expect(toolResult(shared).success).toBe(true);
    expect((toolResult(shared).data as { visibility: string }).visibility).toBe('workspace');

    const memberRead = await mcpPost(app, memberSecret, {
      jsonrpc: '2.0',
      id: 213,
      method: 'tools/call',
      params: { name: 'read_note', arguments: { noteId: childData.id } },
    });
    const memberReadData = toolResult(memberRead).data as { editable: boolean; content: string; hash: string };
    expect(toolResult(memberRead).success).toBe(true);
    expect(memberReadData.editable).toBe(false);
    expect(memberReadData.content).toContain(secretWord);

    const memberEdit = await mcpPost(app, memberSecret, {
      jsonrpc: '2.0',
      id: 214,
      method: 'tools/call',
      params: {
        name: 'edit_note',
        arguments: {
          noteId: childData.id,
          oldString: secretWord,
          newString: 'nope',
          hash: memberReadData.hash,
        },
      },
    });
    expect(toolResult(memberEdit).success).toBe(false);
    expect(toolResult(memberEdit).error).toBe('FORBIDDEN');

    const trashed = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 215,
      method: 'tools/call',
      params: { name: 'trash_note', arguments: { noteId: parentData.id } },
    });
    expect(toolResult(trashed).data).toEqual({ id: parentData.id, trashed: true });

    const afterTrash = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 216,
      method: 'tools/call',
      params: { name: 'list_notes', arguments: {} },
    });
    const remaining = (toolResult(afterTrash).data as Array<{ id: string }>).map((row) => row.id);
    expect(remaining).not.toContain(parentData.id);
    expect(remaining).not.toContain(childData.id);

    const gone = await mcpPost(app, memberSecret, {
      jsonrpc: '2.0',
      id: 217,
      method: 'tools/call',
      params: { name: 'read_note', arguments: { noteId: childData.id } },
    });
    expect(toolResult(gone).error).toBe('NOTE_NOT_FOUND');
  });

  it('rejects note writes when the token grant is read-only', async () => {
    if (!dbReady) return;

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `notes-mcp-readonly-${stamp}@example.com`, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;
    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'notes-readonly', workspaceAccess: [{ workspaceId, canWrite: false }] });
    const secret = tokenRes.body.data.token.secret as string;

    const write = await mcpPost(app, secret, {
      jsonrpc: '2.0',
      id: 220,
      method: 'tools/call',
      params: { name: 'write_note', arguments: { title: 'Should fail' } },
    });
    expect(toolResult(write).success).toBe(false);
    expect(toolResult(write).error).toBe('MCP_READ_ONLY');
  });

  it('creates a list note with a linked sub-note per item in one call', async () => {
    if (!dbReady) return;

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `linked-notes-${stamp}@example.com`, password });
    expect(owner.status).toBe(201);
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;
    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'books-agent', workspaceAccess: [{ workspaceId, canWrite: true }] });
    const secret = tokenRes.body.data.token.secret as string;
    const call = (id: number, name: string, args: object) =>
      mcpPost(app, secret, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

    type Linked = {
      note: { id: string; content: string; hash: string; link: string };
      created: { id: string; title: string; link: string; url: string }[];
    };
    const made = await call(300, 'create_linked_notes', {
      title: 'Books to read',
      content: 'My reading list.',
      heading: 'Books',
      notes: [{ title: 'Dune' }, { title: 'The Hobbit', content: '## First thoughts\n' }],
    });
    expect(toolResult(made).success).toBe(true);
    const books = toolResult(made).data as Linked;
    expect(books.created.map((note) => note.title)).toEqual(['Dune', 'The Hobbit']);
    const [dune, hobbit] = books.created;
    expect(dune.link).toBe(`[[Dune|${dune.id}]]`);
    expect(books.note.link).toBe(`[[Books to read|${books.note.id}]]`);
    expect(books.note.content).toBe(`My reading list.\n\n## Books\n\n- ${dune.link}\n- ${hobbit.link}\n`);

    const children = await call(301, 'list_notes', { parentId: books.note.id });
    expect((toolResult(children).data as { id: string }[]).map((row) => row.id)).toEqual([dune.id, hobbit.id]);
    const hobbitRead = await call(302, 'read_note', { noteId: hobbit.id });
    const hobbitData = toolResult(hobbitRead).data as { content: string; backlinks: { noteId: string }[] };
    expect(hobbitData.content).toBe('## First thoughts\n');
    expect(hobbitData.backlinks.map((link) => link.noteId)).toEqual([books.note.id]);

    const more = await call(303, 'create_linked_notes', {
      noteId: books.note.id,
      hash: books.note.hash,
      listStyle: 'checklist',
      notes: [{ title: 'Emma' }],
    });
    const moreData = toolResult(more).data as Linked;
    expect(moreData.note.content.endsWith(`- [ ] ${moreData.created[0].link}\n`)).toBe(true);

    const stale = await call(304, 'create_linked_notes', {
      noteId: books.note.id,
      hash: books.note.hash,
      notes: [{ title: 'Orphan' }],
    });
    expect(toolResult(stale).error).toBe('HASH_MISMATCH');
    const afterStale = await call(305, 'list_notes', { parentId: books.note.id });
    expect((toolResult(afterStale).data as { title: string }[]).some((row) => row.title === 'Orphan')).toBe(false);

    const quiet = await call(306, 'create_linked_notes', {
      noteId: books.note.id,
      placement: 'none',
      notes: [{ title: 'Unlisted' }],
    });
    expect((toolResult(quiet).data as Linked).note.content).toBe(moreData.note.content);

    const bad = await call(307, 'create_linked_notes', { noteId: books.note.id, title: 'x', notes: [{ title: 'y' }] });
    expect(toolResult(bad).error).toBe('INVALID_ARGS');
  });

  it('creates a kanban board and adds cards by title or existing note', async () => {
    if (!dbReady) return;

    const owner = await request(app)
      .post('/api/auth/register')
      .send({ email: `kanban-mcp-${stamp}@example.com`, password });
    expect(owner.status).toBe(201);
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;
    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'kanban-agent', workspaceAccess: [{ workspaceId, canWrite: true }] });
    const secret = tokenRes.body.data.token.secret as string;
    const call = (id: number, name: string, args: object) =>
      mcpPost(app, secret, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

    const guide = await call(400, 'dirah_guide', {});
    expect(String((toolResult(guide).data as { instructions: string }).instructions)).toContain('create_kanban_card');

    const made = await call(401, 'write_note', { title: 'Launch', kind: 'kanban' });
    expect(toolResult(made).success).toBe(true);
    const board = toolResult(made).data as { id: string; kind: string };
    expect(board.kind).toBe('kanban');

    const read = await call(402, 'read_kanban', { boardId: board.id });
    const boardView = toolResult(read).data as {
      title: string;
      columns: { id: string; title: string; cards: { noteId: string; title: string }[] }[];
    };
    expect(toolResult(read).success).toBe(true);
    expect(boardView.title).toBe('Launch');
    expect(boardView.columns.map((column) => column.title)).toEqual(['To do', 'Doing', 'Done']);
    expect(boardView.columns.every((column) => column.cards.length === 0)).toBe(true);

    const added = await call(403, 'create_kanban_card', {
      boardId: board.id,
      column: 'doing',
      title: 'Ship it',
      content: 'Release notes',
    });
    expect(toolResult(added).success).toBe(true);
    const card = toolResult(added).data as {
      card: { noteId: string; title: string; link: string };
      column: { title: string };
    };
    expect(card.column.title).toBe('Doing');
    expect(card.card.title).toBe('Ship it');
    expect(card.card.link).toBe(`[[Ship it|${card.card.noteId}]]`);
    const cardRead = await call(404, 'read_note', { noteId: card.card.noteId });
    expect((toolResult(cardRead).data as { content: string; kind: string }).content).toBe('Release notes');
    expect((toolResult(cardRead).data as { kind: string }).kind).toBe('note');

    const source = await call(405, 'write_note', { title: 'Existing task' });
    const sourceId = (toolResult(source).data as { id: string; kind: string }).id;
    expect((toolResult(source).data as { kind: string }).kind).toBe('note');
    const placed = await call(406, 'create_kanban_card', {
      boardId: board.id,
      column: boardView.columns[0].id,
      noteId: sourceId,
    });
    expect(toolResult(placed).success).toBe(true);
    expect((toolResult(placed).data as { card: { noteId: string }; column: { title: string } }).card.noteId).toBe(
      sourceId
    );
    expect((toolResult(placed).data as { column: { title: string } }).column.title).toBe('To do');

    const again = await call(407, 'read_kanban', { boardId: board.id });
    const filled = toolResult(again).data as typeof boardView;
    expect(filled.columns.find((column) => column.title === 'To do')?.cards.map((item) => item.noteId)).toEqual([
      sourceId,
    ]);
    expect(filled.columns.find((column) => column.title === 'Doing')?.cards.map((item) => item.title)).toEqual([
      'Ship it',
    ]);

    const missing = await call(408, 'create_kanban_card', { boardId: board.id, column: 'Later', title: 'Nope' });
    expect(toolResult(missing).success).toBe(false);
    expect(toolResult(missing).error).toBe('COLUMN_NOT_FOUND');
    expect(toolResult(missing).details).toEqual({ columns: ['To do', 'Doing', 'Done'] });

    const listed = await call(409, 'list_notes', {});
    expect(
      (toolResult(listed).data as { id: string; kind: string }[]).find((row) => row.id === board.id)?.kind
    ).toBe('kanban');
  });

  it('creates, updates, reads, comments on and searches tickets by key', async () => {
    if (!dbReady) return;
    const email = `tickets-mcp-${stamp}@example.com`;
    const owner = await request(app).post('/api/auth/register').send({ email, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;
    const board = await request(app)
      .post(`/api/workspaces/${workspaceId}/ticket-boards`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'Agent work', key: 'AGT' });
    expect(board.status).toBe(201);

    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'ticket-agent' });
    const secret = tokenRes.body.data.token.secret as string;
    await request(app)
      .put(`/api/mcp/tokens/${tokenRes.body.data.token.id}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });

    const call = async (name: string, args: Record<string, unknown>) =>
      toolResult(
        await mcpPost(app, secret, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
      );

    const boards = await call('list_ticket_boards', {});
    expect((boards.data as { key: string }[]).map((row) => row.key)).toEqual(['AGT']);

    const created = await call('create_ticket', {
      board: 'agt',
      title: 'Wire up billing',
      status: 'in progress',
      priority: 'high',
      assignees: [email],
      dueDate: '2026-11-01',
    });
    expect(created.success).toBe(true);
    const ticket = created.data as { key: string; status: string; assignees: string[]; url: string };
    expect(ticket.key).toBe('AGT-1');
    expect(ticket.status).toBe('In progress');
    expect(ticket.assignees).toEqual([email]);
    expect(ticket.url).toContain('?ticket=AGT-1');

    const badStatus = await call('update_ticket', { key: 'AGT-1', status: 'Nope' });
    expect(badStatus.success).toBe(false);
    expect(badStatus.error).toBe('UNKNOWN_STATUS');

    const updated = await call('update_ticket', { key: 'agt 1', status: 'Done', assignees: [] });
    expect((updated.data as { status: string; assignees: string[] }).status).toBe('Done');
    expect((updated.data as { assignees: string[] }).assignees).toEqual([]);

    await call('comment_ticket', { key: 'AGT-1', body: 'Shipped' });
    const read = await call('read_ticket', { key: 'AGT-1' });
    const detail = read.data as { comments: { body: string }[]; activity: { type: string }[] };
    expect(detail.comments.map((comment) => comment.body)).toEqual(['Shipped']);
    expect(detail.activity.map((entry) => entry.type)).toEqual(
      expect.arrayContaining(['created', 'status', 'assignees'])
    );

    const openBoard = await call('read_ticket_board', { board: 'AGT' });
    expect((openBoard.data as { tickets: unknown[] }).tickets).toEqual([]);
    const allBoard = await call('read_ticket_board', { board: 'AGT', state: 'all' });
    expect((allBoard.data as { tickets: unknown[] }).tickets).toHaveLength(1);

    const found = await call('search_tickets', { q: 'billing', status: 'done' });
    expect((found.data as { key: string }[]).map((row) => row.key)).toEqual(['AGT-1']);
  });

  it('manages boards, statuses, groups, ordering, deletes and comments over MCP', async () => {
    if (!dbReady) return;
    const email = `tickets-admin-mcp-${stamp}@example.com`;
    const owner = await request(app).post('/api/auth/register').send({ email, password });
    const jwt = owner.body.data.tokens.accessToken as string;
    const workspaceId = owner.body.data.workspace.id as string;
    const tokenRes = await request(app)
      .post('/api/mcp/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'ticket-admin-agent' });
    const secret = tokenRes.body.data.token.secret as string;
    const tokenId = tokenRes.body.data.token.id as string;
    await request(app)
      .put(`/api/mcp/tokens/${tokenId}/access`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ workspaces: [{ workspaceId, canWrite: true }] });
    const call = async (name: string, args: Record<string, unknown>) =>
      toolResult(
        await mcpPost(app, secret, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
      );
    type Summary = { board: { key: string; name: string }; statuses: { name: string; category: string }[]; groups: { name: string }[] };

    const created = await call('create_ticket_board', { name: 'Operations', key: 'ops' });
    expect(created.success).toBe(true);
    expect((created.data as Summary).board.key).toBe('OPS');
    expect((created.data as Summary).statuses.map((status) => status.name)).toEqual(['To do', 'In progress', 'Blocked', 'Done']);

    const renamed = await call('update_ticket_board', { board: 'OPS', name: 'Ops', description: 'Run the place' });
    expect((renamed.data as Summary).board.name).toBe('Ops');

    // A new status lands where asked; an existing one is updated in place.
    const review = await call('save_ticket_status', { board: 'OPS', name: 'Review', category: 'doing', color: 'purple', position: 2 });
    expect((review.data as Summary).statuses.map((status) => status.name)).toEqual([
      'To do',
      'In progress',
      'Review',
      'Blocked',
      'Done',
    ]);
    const shipped = await call('save_ticket_status', { board: 'OPS', name: 'done', rename: 'Shipped' });
    const statuses = (shipped.data as Summary).statuses;
    expect(statuses.at(-1)).toMatchObject({ name: 'Shipped', category: 'done' });

    const groups = await call('save_ticket_group', { board: 'OPS', name: 'Later', position: 0 });
    expect((groups.data as Summary).groups[0].name).toBe('Later');

    for (const title of ['One', 'Two', 'Three']) await call('create_ticket', { board: 'OPS', title });
    const moved = await call('move_ticket', { key: 'OPS-3', status: 'Review', statusPosition: 0, group: 'Later' });
    expect(moved.success).toBe(true);
    expect(moved.data).toMatchObject({ key: 'OPS-3', status: 'Review', group: 'Later' });
    const reordered = await call('move_ticket', { key: 'OPS-2', statusPosition: 0 });
    expect(reordered.success).toBe(true);
    const board = await call('read_ticket_board', { board: 'OPS' });
    expect((board.data as { tickets: { key: string }[] }).tickets.map((row) => row.key)).toEqual(
      expect.arrayContaining(['OPS-1', 'OPS-2', 'OPS-3'])
    );
    const noMove = await call('move_ticket', { key: 'OPS-1' });
    expect(noMove.error).toBe('INVALID_MOVE');

    // A status with tickets needs somewhere to send them.
    const needsTarget = await call('delete_ticket_status', { board: 'OPS', name: 'Review' });
    expect(needsTarget.error).toBe('MOVE_TARGET_REQUIRED');
    const dropped = await call('delete_ticket_status', { board: 'OPS', name: 'Review', moveTo: 'Blocked' });
    expect((dropped.data as Summary).statuses.map((status) => status.name)).not.toContain('Review');
    expect((await call('read_ticket', { key: 'OPS-3' })).data).toMatchObject({ status: 'Blocked' });
    const groupGone = await call('delete_ticket_group', { board: 'OPS', name: 'Later' });
    expect((groupGone.data as Summary).groups.map((group) => group.name)).not.toContain('Later');

    // Comments carry ids, and an id can't reach across tickets.
    await call('comment_ticket', { key: 'OPS-1', body: 'First draft' });
    const withComment = (await call('read_ticket', { key: 'OPS-1' })).data as { comments: { id: string; body: string }[] };
    const commentId = withComment.comments[0].id;
    const edited = await call('edit_ticket_comment', { key: 'OPS-1', commentId, body: 'Final' });
    expect((edited.data as { comment: { body: string } }).comment.body).toBe('Final');
    const crossTicket = await call('delete_ticket_comment', { key: 'OPS-2', commentId });
    expect(crossTicket.error).toBe('COMMENT_NOT_FOUND');
    expect((await call('delete_ticket_comment', { key: 'OPS-1', commentId })).success).toBe(true);
    expect(((await call('read_ticket', { key: 'OPS-1' })).data as { comments: unknown[] }).comments).toEqual([]);

    expect((await call('delete_ticket', { key: 'OPS-2' })).data).toEqual({ deleted: 'OPS-2' });
    expect((await call('read_ticket', { key: 'OPS-2' })).success).toBe(false);
    expect((await call('delete_ticket_board', { board: 'OPS' })).success).toBe(true);
    expect((await call('list_ticket_boards', {})).data).toEqual([]);

    // Audit rows now say which workspace the ticket tool touched.
    const audited = await pool.query(
      `select distinct workspace_id from mcp_audit where token_id = $1 and tool like '%ticket%'`,
      [tokenId]
    );
    expect(audited.rows.map((row: { workspace_id: string | null }) => row.workspace_id)).toEqual([workspaceId]);
  });

  it('opens images linked from tickets, notes and pages with read_image', async () => {
    if (!dbReady) return;
    const register = async (label: string) => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: `mcp-images-${label}-${stamp}@example.com`, password });
      expect(res.status).toBe(201);
      return { jwt: res.body.data.tokens.accessToken as string, workspaceId: res.body.data.workspace.id as string };
    };
    const owner = await register('owner');
    const viewer = await register('viewer');
    const stranger = await register('stranger');
    const workspaceId = owner.workspaceId;
    const as = (jwt: string) => ({ Authorization: `Bearer ${jwt}` });

    const invite = await request(app)
      .post(`/api/workspaces/${workspaceId}/members`)
      .set(as(owner.jwt))
      .send({ email: `mcp-images-viewer-${stamp}@example.com`, role: 'viewer' });
    const inviteToken = String(invite.body.data.invite.inviteUrl).split('/invite/')[1];
    expect((await request(app).post(`/api/invites/${inviteToken}/accept`).set(as(viewer.jwt)).send({})).status).toBe(201);

    const second = await request(app).post('/api/workspaces').set(as(owner.jwt)).send({ name: 'Images elsewhere' });
    const secondId = second.body.data.workspace.id as string;

    const upload = async (jwt: string, ws: string, body: Buffer, type: string) => {
      const res = await request(app).post(`/api/workspaces/${ws}/blobs`).set(as(jwt)).set('Content-Type', type).send(body);
      expect(res.status).toBe(201);
      return res.body.data.blob as { id: string; url: string };
    };
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const pngBytes = Buffer.concat([pngHeader, Buffer.from(`shot-${stamp}`)]);
    const shot = await upload(owner.jwt, workspaceId, pngBytes, 'image/png');
    const textFile = await upload(owner.jwt, workspaceId, Buffer.from(`notes ${stamp}`), 'text/plain');
    const huge = await upload(owner.jwt, workspaceId, Buffer.concat([pngHeader, Buffer.alloc(6 * 1024 * 1024, 1)]), 'image/png');
    const elsewhere = await upload(owner.jwt, secondId, Buffer.concat([pngHeader, Buffer.from(`second-${stamp}`)]), 'image/png');
    const strangers = await upload(stranger.jwt, stranger.workspaceId, Buffer.concat([pngHeader, Buffer.from(`x-${stamp}`)]), 'image/png');

    const tokenFor = async (jwt: string, canWrite: boolean) => {
      const res = await request(app).post('/api/mcp/tokens').set(as(jwt)).send({ name: 'image-agent' });
      const id = res.body.data.token.id as string;
      await request(app).put(`/api/mcp/tokens/${id}/access`).set(as(jwt)).send({ workspaces: [{ workspaceId, canWrite }] });
      return res.body.data.token.secret as string;
    };
    const ownerSecret = await tokenFor(owner.jwt, true);
    const viewerSecret = await tokenFor(viewer.jwt, false);

    const rawCall = async (secret: string, name: string, args: Record<string, unknown>) => {
      const res = await mcpPost(app, secret, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
      const body = parseMcpBody(res.body?.result ? res.body : res.text);
      return (body.result ?? body) as { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> };
    };
    const call = async (secret: string, name: string, args: Record<string, unknown>) =>
      JSON.parse((await rawCall(secret, name, args)).content[0].text ?? '{}') as {
        success: boolean;
        data?: Record<string, unknown>;
        error?: string;
      };

    // A ticket lists its images; read_image returns the bytes as MCP image content.
    await call(ownerSecret, 'create_ticket_board', { name: 'Bugs', key: 'IMG' });
    await call(ownerSecret, 'create_ticket', {
      board: 'IMG',
      title: 'Broken layout',
      description: `See ![shot](${shot.url}) and [log](${textFile.url}).`,
    });
    await call(ownerSecret, 'comment_ticket', { key: 'IMG-1', body: `Again: ![shot](${shot.url})` });
    const ticket = await call(ownerSecret, 'read_ticket', { key: 'IMG-1' });
    expect(ticket.data?.attachments).toEqual([
      { blobId: shot.id, url: shot.url },
      { blobId: textFile.id, url: textFile.url },
    ]);

    const opened = await rawCall(ownerSecret, 'read_image', { url: shot.url });
    const meta = JSON.parse(opened.content[0].text ?? '{}');
    expect(meta.data).toMatchObject({ blobId: shot.id, workspaceId, mimeType: 'image/png', viewable: true });
    expect(opened.content[1]).toMatchObject({ type: 'image', mimeType: 'image/png' });
    expect(Buffer.from(opened.content[1].data ?? '', 'base64').equals(pngBytes)).toBe(true);

    const byId = await rawCall(ownerSecret, 'read_image', { blobId: shot.id });
    expect(byId.content[1]?.type).toBe('image');
    const fullUrl = await rawCall(ownerSecret, 'read_image', { url: `https://api.example.com${shot.url}` });
    expect(fullUrl.content[1]?.type).toBe('image');

    // Not an image, or too big: details only.
    const text = await rawCall(ownerSecret, 'read_image', { url: textFile.url });
    expect(text.content).toHaveLength(1);
    expect(JSON.parse(text.content[0].text ?? '{}').data).toMatchObject({ viewable: false, reason: 'not_an_image' });
    const big = await rawCall(ownerSecret, 'read_image', { url: huge.url });
    expect(big.content).toHaveLength(1);
    expect(JSON.parse(big.content[0].text ?? '{}').data).toMatchObject({ viewable: false, reason: 'too_large' });

    // Outside the token's allowlist, or the user's workspaces, it looks missing.
    expect((await call(ownerSecret, 'read_image', { url: elsewhere.url })).error).toBe('BLOB_NOT_FOUND');
    expect((await call(ownerSecret, 'read_image', { url: strangers.url })).error).toBe('BLOB_NOT_FOUND');
    expect((await call(ownerSecret, 'read_image', { url: '/api/blobs/does-not-exist' })).error).toBe('BLOB_NOT_FOUND');
    expect((await call(ownerSecret, 'read_image', { url: 'https://evil.example/x.png' })).error).toBe('INVALID_BLOB_REF');
    expect((await call(ownerSecret, 'read_image', {})).error).toBe('INVALID_BLOB_REF');

    // A private note's image stays private: the author sees it, another member does not.
    const note = await request(app)
      .post(`/api/workspaces/${workspaceId}/notes`)
      .set(as(owner.jwt))
      .send({ title: 'Private photos', visibility: 'private' });
    expect(note.status).toBe(201);
    const noteId = note.body.data.note.id as string;
    const attached = await request(app)
      .post(`/api/notes/${noteId}/attachments`)
      .set(as(owner.jwt))
      .set('Content-Type', 'image/png')
      .send(Buffer.concat([pngHeader, Buffer.from(`note-${stamp}`)]));
    expect(attached.status).toBe(201);
    const noteImage = attached.body.data.blob as { id: string; url: string };
    const saved = await request(app)
      .put(`/api/notes/${noteId}/content`)
      .set(as(owner.jwt))
      .send({ content: `![photo](${noteImage.url})\n` });
    expect(saved.status).toBe(200);
    const readNote = await call(ownerSecret, 'read_note', { noteId });
    expect(readNote.data?.attachments).toEqual([{ blobId: noteImage.id, url: noteImage.url }]);
    expect((await rawCall(ownerSecret, 'read_image', { url: noteImage.url })).content[1]?.type).toBe('image');
    expect((await call(viewerSecret, 'read_image', { url: noteImage.url })).error).toBe('BLOB_NOT_FOUND');
    expect((await rawCall(viewerSecret, 'read_image', { url: shot.url })).content[1]?.type).toBe('image');

    // Pages list their images too.
    await call(ownerSecret, 'write_file', { path: 'design.md', content: `# Design\n\n![shot](${shot.url})\n` });
    const page = await call(ownerSecret, 'read_file', { path: 'design.md' });
    expect(page.data?.attachments).toEqual([{ blobId: shot.id, url: shot.url }]);
  }, 30_000);
});
