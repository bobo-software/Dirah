import { HttpError } from '../utils/HttpError';
import {
  markdownSlugFromSegment,
  parseDocsPath,
  slugify,
} from '../utils/slugify';
import type { PageKind, PageService, PublicPage } from './PageService';
import type { McpTokenService } from './McpTokenService';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DocsTreeNode {
  id: string;
  title: string;
  kind: PageKind;
  slug: string | null;
  path: string;
  parentId: string | null;
}

export interface CompactTreeNode {
  id: string;
  path: string;
  kind: PageKind;
}

export interface ResolvedWorkspace {
  workspaceId: string;
  name: string;
  slug: string;
}

function isDocsKind(kind: PageKind): boolean {
  return kind === 'folder' || kind === 'markdown';
}

function segmentFor(page: PublicPage): string {
  const slug = page.slug || slugify(page.title);
  return page.kind === 'markdown' ? `${slug}.md` : slug;
}

function normalizePrefix(prefix?: string): string {
  if (!prefix) return '';
  return parseDocsPath(prefix).join('/');
}

function pathDepth(path: string): number {
  return path.split('/').filter(Boolean).length;
}

export class DocsMcpService {
  constructor(
    private readonly pages: PageService,
    private readonly tokens: McpTokenService,
    private readonly options: { appPublicUrl?: string } = {}
  ) {}

  pageUrl(workspaceId: string, pageId: string): string {
    const origin = (this.options.appPublicUrl ?? '').replace(/\/$/, '') || 'http://localhost:5181';
    return `${origin}/w/${workspaceId}/p/${pageId}`;
  }

  async listWorkspaces(userId: string) {
    const rows = await this.allowlisted(userId);
    const only = rows.length === 1;
    return rows.map((row) => ({
      workspaceId: row.workspaceId,
      name: row.name,
      slug: row.slug,
      role: row.role,
      canWrite: row.canWrite,
      default: only,
    }));
  }

  async resolveWorkspace(
    userId: string,
    ref?: string | null,
    options: { optional?: boolean } = {}
  ): Promise<ResolvedWorkspace | null> {
    const allowed = await this.allowlisted(userId);
    const raw = (ref ?? '').trim();
    if (!raw) {
      if (options.optional) return null;
      if (allowed.length === 1) return allowed[0];
      if (allowed.length === 0) {
        throw new HttpError('Workspace is not allowlisted for MCP', 403, 'MCP_NOT_ALLOWLISTED');
      }
      throw new HttpError(
        'workspace or workspaceId is required when more than one workspace is allowlisted',
        400,
        'WORKSPACE_REQUIRED'
      );
    }
    if (UUID_RE.test(raw)) {
      const hit = allowed.find((row) => row.workspaceId === raw);
      if (!hit) {
        throw new HttpError('Workspace is not allowlisted for MCP', 403, 'MCP_NOT_ALLOWLISTED');
      }
      return hit;
    }
    const lower = raw.toLowerCase();
    const byName = allowed.filter((row) => row.name.toLowerCase() === lower);
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) {
      throw new HttpError('Workspace name is ambiguous', 400, 'WORKSPACE_AMBIGUOUS');
    }
    const wantSlug = slugify(raw);
    const bySlug = allowed.filter((row) => row.slug === wantSlug);
    if (bySlug.length === 1) return bySlug[0];
    if (bySlug.length > 1) {
      throw new HttpError('Workspace slug is ambiguous', 400, 'WORKSPACE_AMBIGUOUS');
    }
    throw new HttpError('Workspace not found', 404, 'WORKSPACE_NOT_FOUND');
  }

  async listTree(
    userId: string,
    workspaceId: string,
    options: { prefix?: string; depth?: number } = {}
  ): Promise<CompactTreeNode[]> {
    const tree = await this.loadTree(userId, workspaceId);
    const prefix = normalizePrefix(options.prefix);
    const filtered = prefix
      ? tree.filter((node) => node.path === prefix || node.path.startsWith(`${prefix}/`))
      : tree;
    const baseDepth = prefix ? pathDepth(prefix) : 0;
    const withDepth =
      options.depth == null
        ? filtered
        : filtered.filter((node) => {
            const extra = pathDepth(node.path) - baseDepth;
            if (prefix && node.path === prefix) return true;
            return extra >= 1 && extra <= options.depth!;
          });
    return withDepth.map((node) => ({ id: node.id, path: node.path, kind: node.kind }));
  }

  async getNode(userId: string, workspaceId: string, nodeId: string) {
    await this.tokens.requireAllowlist(userId, workspaceId, false);
    const page = await this.pages.requireMemberPage(userId, nodeId);
    if (page.workspaceId !== workspaceId || !isDocsKind(page.kind)) {
      throw new HttpError('Docs node not found', 404, 'DOCS_NOT_FOUND');
    }
    const tree = await this.loadTree(userId, workspaceId);
    const node = tree.find((item) => item.id === nodeId);
    const path = node?.path ?? segmentFor(page);
    return {
      id: page.id,
      title: page.title,
      kind: page.kind,
      slug: page.slug,
      path,
      parentId: page.parentId,
      url: page.kind === 'markdown' ? this.pageUrl(workspaceId, page.id) : undefined,
    };
  }

  async readFile(
    userId: string,
    workspaceId: string,
    pathOrId: { path?: string; nodeId?: string; startLine?: number; maxLines?: number }
  ) {
    await this.tokens.requireAllowlist(userId, workspaceId, false);
    const page = await this.resolveDocsNode(userId, workspaceId, pathOrId, 'markdown');
    const body = await this.pages.getMarkdown(userId, page.id);
    const lines = body.content.split('\n');
    const totalLines = lines.length;
    const startLine = Math.max(1, Math.floor(pathOrId.startLine ?? 1));
    const maxLines =
      pathOrId.maxLines != null ? Math.max(1, Math.floor(pathOrId.maxLines)) : undefined;
    const sliced =
      pathOrId.startLine != null || maxLines != null
        ? lines.slice(startLine - 1, maxLines != null ? startLine - 1 + maxLines : undefined)
        : lines;
    const content = sliced.join('\n');
    const endLine = Math.min(totalLines, startLine - 1 + sliced.length);
    return {
      id: page.id,
      title: page.title,
      path: (await this.pathOf(userId, workspaceId, page.id)) ?? `${page.slug ?? 'untitled'}.md`,
      content,
      hash: body.hash,
      updatedAt: body.updatedAt,
      url: this.pageUrl(workspaceId, page.id),
      startLine,
      endLine: sliced.length ? endLine : startLine - 1,
      totalLines,
    };
  }

  async writeFile(
    userId: string,
    workspaceId: string,
    input: { path: string; content: string; createParents?: boolean; hash?: string }
  ) {
    await this.tokens.requireAllowlist(userId, workspaceId, true);
    const segments = parseDocsPath(input.path);
    if (!segments.length) {
      throw new HttpError('Path is required', 400, 'INVALID_PATH');
    }
    const fileSeg = segments.at(-1)!;
    const folderSegs = segments.slice(0, -1);
    const parentId = await this.ensureFolders(userId, workspaceId, folderSegs, input.createParents ?? true);
    const slug = markdownSlugFromSegment(fileSeg);
    const existing = await this.findChild(userId, workspaceId, parentId, slug, 'markdown');
    const page =
      existing ??
      (await this.pages.create(userId, workspaceId, {
        title: fileSeg.replace(/\.md$/i, '') || 'Untitled',
        parentId,
        kind: 'markdown',
        slug,
      }));
    const body = await this.pages.putMarkdown(userId, page.id, input.content, input.hash);
    const path = segments.join('/');
    return {
      id: page.id,
      title: page.title,
      path,
      hash: body.hash,
      created: !existing,
      url: this.pageUrl(workspaceId, page.id),
    };
  }

  async editFile(
    userId: string,
    workspaceId: string,
    input: {
      path?: string;
      nodeId?: string;
      oldString: string;
      newString: string;
      hash?: string;
    }
  ) {
    await this.tokens.requireAllowlist(userId, workspaceId, true);
    if (!input.oldString) {
      throw new HttpError('oldString is required', 400, 'INVALID_PATCH');
    }
    const current = await this.readFile(userId, workspaceId, input);
    if (!current.content.includes(input.oldString)) {
      throw new HttpError('oldString was not found', 400, 'PATCH_NOT_FOUND');
    }
    const next = current.content.replace(input.oldString, input.newString);
    const body = await this.pages.putMarkdown(userId, current.id, next, input.hash ?? current.hash);
    return {
      id: current.id,
      path: current.path,
      hash: body.hash,
      url: this.pageUrl(workspaceId, current.id),
    };
  }

  async createFolder(userId: string, workspaceId: string, input: { path: string }) {
    await this.tokens.requireAllowlist(userId, workspaceId, true);
    const segments = parseDocsPath(input.path);
    if (!segments.length) {
      throw new HttpError('Path is required', 400, 'INVALID_PATH');
    }
    const parentId = await this.ensureFolders(userId, workspaceId, segments, true);
    const pages = await this.pages.list(userId, workspaceId);
    const folder = pages.find((page) => page.id === parentId && page.kind === 'folder');
    if (!folder) {
      throw new HttpError('Folder not found', 404, 'DOCS_NOT_FOUND');
    }
    return { id: folder.id, title: folder.title, path: segments.join('/') };
  }

  async rename(
    userId: string,
    workspaceId: string,
    input: { path?: string; nodeId?: string; title?: string; slug?: string }
  ) {
    await this.tokens.requireAllowlist(userId, workspaceId, true);
    const page = await this.resolveDocsNode(userId, workspaceId, input);
    const updated = await this.pages.patch(userId, page.id, {
      title: input.title,
      slug: input.slug,
    });
    return {
      id: updated.id,
      title: updated.title,
      slug: updated.slug,
      path: await this.pathOf(userId, workspaceId, updated.id),
    };
  }

  async move(
    userId: string,
    workspaceId: string,
    input: { path?: string; nodeId?: string; parentPath?: string; parentId?: string | null }
  ) {
    await this.tokens.requireAllowlist(userId, workspaceId, true);
    const page = await this.resolveDocsNode(userId, workspaceId, input);
    let parentId = input.parentId ?? null;
    if (input.parentPath) {
      const parent = await this.resolveDocsNode(userId, workspaceId, { path: input.parentPath }, 'folder');
      parentId = parent.id;
    }
    const updated = await this.pages.patch(userId, page.id, { parentId });
    return { id: updated.id, parentId: updated.parentId, path: await this.pathOf(userId, workspaceId, updated.id) };
  }

  async delete(userId: string, workspaceId: string, input: { path?: string; nodeId?: string }) {
    await this.tokens.requireAllowlist(userId, workspaceId, true);
    const page = await this.resolveDocsNode(userId, workspaceId, input);
    await this.pages.trash(userId, page.id);
    return { id: page.id, trashed: true };
  }

  async searchDocs(
    userId: string,
    ref: string | null | undefined,
    q: string,
    limit = 20
  ) {
    const cap = Math.min(50, Math.max(1, limit));
    const resolved = await this.resolveWorkspace(userId, ref, { optional: true });
    const targets = resolved ? [resolved] : await this.allowlisted(userId);
    if (!targets.length) {
      throw new HttpError('Workspace is not allowlisted for MCP', 403, 'MCP_NOT_ALLOWLISTED');
    }
    const hits: Array<{
      id: string;
      title: string;
      path: string;
      workspaceId: string;
      workspace: string;
      snippet: string;
      url: string;
    }> = [];
    for (const workspace of targets) {
      await this.tokens.requireAllowlist(userId, workspace.workspaceId, false);
      const found = await this.pages.searchMarkdown(userId, workspace.workspaceId, q, cap);
      const tree = await this.loadTree(userId, workspace.workspaceId);
      const pathById = new Map(tree.map((node) => [node.id, node.path]));
      for (const hit of found) {
        hits.push({
          id: hit.page.id,
          title: hit.page.title,
          path: pathById.get(hit.page.id) ?? `${hit.page.slug ?? 'untitled'}.md`,
          workspaceId: workspace.workspaceId,
          workspace: workspace.slug,
          snippet: hit.snippet,
          url: this.pageUrl(workspace.workspaceId, hit.page.id),
        });
        if (hits.length >= cap) return hits;
      }
    }
    return hits;
  }

  recordAudit(entry: Parameters<McpTokenService['recordAudit']>[0]): Promise<void> {
    return this.tokens.recordAudit(entry);
  }

  private async allowlisted(userId: string): Promise<Array<ResolvedWorkspace & { role: string; canWrite: boolean }>> {
    const rows = await this.tokens.listAccess(userId);
    return rows
      .filter((row) => row.allowlisted && row.mcpEnabled !== false && !row.encrypted)
      .map((row) => ({
        workspaceId: row.workspaceId,
        name: row.name,
        slug: slugify(row.name),
        role: row.role,
        canWrite: row.canWrite,
      }));
  }

  private async loadTree(userId: string, workspaceId: string): Promise<DocsTreeNode[]> {
    await this.tokens.requireAllowlist(userId, workspaceId, false);
    const pages = await this.pages.list(userId, workspaceId);
    return this.withPaths(pages.filter((page) => isDocsKind(page.kind)));
  }

  private async resolveDocsNode(
    userId: string,
    workspaceId: string,
    input: { path?: string; nodeId?: string },
    expected?: PageKind
  ): Promise<PublicPage> {
    if (input.nodeId) {
      const page = await this.pages.requireMemberPage(userId, input.nodeId);
      if (page.workspaceId !== workspaceId || !isDocsKind(page.kind)) {
        throw new HttpError('Docs node not found', 404, 'DOCS_NOT_FOUND');
      }
      if (expected && page.kind !== expected) {
        throw new HttpError('Docs node kind mismatch', 400, 'INVALID_KIND');
      }
      return page;
    }
    if (!input.path) {
      throw new HttpError('path or nodeId is required', 400, 'INVALID_PATH');
    }
    const segments = parseDocsPath(input.path);
    let parentId: string | null = null;
    let page: PublicPage | null = null;
    for (let i = 0; i < segments.length; i += 1) {
      const last = i === segments.length - 1;
      const kind: PageKind =
        last && expected === 'markdown'
          ? 'markdown'
          : last && expected
            ? expected
            : last
              ? 'markdown'
              : 'folder';
      const slug = last && kind === 'markdown' ? markdownSlugFromSegment(segments[i]) : slugify(segments[i]);
      const found = await this.findChild(userId, workspaceId, parentId, slug, last ? undefined : 'folder');
      if (!found) {
        throw new HttpError(`Not found: ${segments.slice(0, i + 1).join('/')}`, 404, 'DOCS_NOT_FOUND');
      }
      page = found;
      parentId = found.id;
    }
    if (!page) {
      throw new HttpError('Docs node not found', 404, 'DOCS_NOT_FOUND');
    }
    if (expected && page.kind !== expected) {
      throw new HttpError('Docs node kind mismatch', 400, 'INVALID_KIND');
    }
    return page;
  }

  private async ensureFolders(
    userId: string,
    workspaceId: string,
    segments: string[],
    create: boolean
  ): Promise<string | null> {
    let parentId: string | null = null;
    for (const segment of segments) {
      const slug = slugify(segment);
      const existing = await this.findChild(userId, workspaceId, parentId, slug, 'folder');
      if (existing) {
        parentId = existing.id;
        continue;
      }
      if (!create) {
        throw new HttpError(`Folder not found: ${segment}`, 404, 'DOCS_NOT_FOUND');
      }
      const folder = await this.pages.create(userId, workspaceId, {
        title: segment,
        parentId,
        kind: 'folder',
        slug,
      });
      parentId = folder.id;
    }
    return parentId;
  }

  private async findChild(
    userId: string,
    workspaceId: string,
    parentId: string | null,
    slug: string,
    kind?: PageKind
  ): Promise<PublicPage | null> {
    const pages = await this.pages.list(userId, workspaceId);
    return (
      pages.find(
        (page) => page.parentId === parentId && page.slug === slug && (!kind || page.kind === kind)
      ) ?? null
    );
  }

  private async pathOf(userId: string, workspaceId: string, nodeId: string): Promise<string | null> {
    const tree = await this.loadTree(userId, workspaceId);
    return tree.find((node) => node.id === nodeId)?.path ?? null;
  }

  private withPaths(docs: PublicPage[]): DocsTreeNode[] {
    const byId = new Map(docs.map((page) => [page.id, page]));
    const memo = new Map<string, string>();
    const pathOf = (page: PublicPage): string => {
      if (memo.has(page.id)) return memo.get(page.id)!;
      const seg = segmentFor(page);
      const parent = page.parentId ? byId.get(page.parentId) : undefined;
      const full = parent && isDocsKind(parent.kind) ? `${pathOf(parent)}/${seg}` : seg;
      memo.set(page.id, full);
      return full;
    };
    return docs.map((page) => ({
      id: page.id,
      title: page.title,
      kind: page.kind,
      slug: page.slug,
      parentId: page.parentId,
      path: pathOf(page),
    }));
  }
}
