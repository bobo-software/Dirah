import { HttpError } from '../utils/HttpError';
import {
  markdownSlugFromSegment,
  parseDocsPath,
  slugify,
} from '../utils/slugify';
import type { PageKind, PageService, PublicPage } from './PageService';
import type { McpTokenService } from './McpTokenService';

export interface DocsTreeNode {
  id: string;
  title: string;
  kind: PageKind;
  slug: string | null;
  path: string;
  parentId: string | null;
}

function isDocsKind(kind: PageKind): boolean {
  return kind === 'folder' || kind === 'markdown';
}

function segmentFor(page: PublicPage): string {
  const slug = page.slug || slugify(page.title);
  return page.kind === 'markdown' ? `${slug}.md` : slug;
}

export class DocsMcpService {
  constructor(
    private readonly pages: PageService,
    private readonly tokens: McpTokenService
  ) {}

  async listWorkspaces(userId: string) {
    const rows = await this.tokens.listAccess(userId);
    return rows
      .filter((row) => row.allowlisted && row.mcpEnabled !== false && !row.encrypted)
      .map((row) => ({
        workspaceId: row.workspaceId,
        name: row.name,
        role: row.role,
        canWrite: row.canWrite,
      }));
  }

  async listTree(userId: string, workspaceId: string): Promise<DocsTreeNode[]> {
    await this.tokens.requireAllowlist(userId, workspaceId, false);
    const pages = await this.pages.list(userId, workspaceId);
    return this.withPaths(pages.filter((page) => isDocsKind(page.kind)));
  }

  async getNode(userId: string, workspaceId: string, nodeId: string) {
    await this.tokens.requireAllowlist(userId, workspaceId, false);
    const page = await this.pages.requireMemberPage(userId, nodeId);
    if (page.workspaceId !== workspaceId || !isDocsKind(page.kind)) {
      throw new HttpError('Docs node not found', 404, 'DOCS_NOT_FOUND');
    }
    const tree = await this.listTree(userId, workspaceId);
    return tree.find((node) => node.id === nodeId) ?? { ...page, path: segmentFor(page) };
  }

  async readFile(userId: string, workspaceId: string, pathOrId: { path?: string; nodeId?: string }) {
    await this.tokens.requireAllowlist(userId, workspaceId, false);
    const page = await this.resolveDocsNode(userId, workspaceId, pathOrId, 'markdown');
    const body = await this.pages.getMarkdown(userId, page.id);
    return {
      id: page.id,
      title: page.title,
      path: (await this.pathOf(userId, workspaceId, page.id)) ?? `${page.slug ?? 'untitled'}.md`,
      content: body.content,
      hash: body.hash,
      updatedAt: body.updatedAt,
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
    return {
      id: page.id,
      title: page.title,
      path: segments.join('/'),
      hash: body.hash,
      created: !existing,
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
    return { id: current.id, path: current.path, hash: body.hash };
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

  async searchDocs(userId: string, workspaceId: string, q: string) {
    await this.tokens.requireAllowlist(userId, workspaceId, false);
    const pages = await this.pages.list(userId, workspaceId, { q });
    return this.withPaths(pages.filter((page) => page.kind === 'markdown'));
  }

  recordAudit(entry: Parameters<McpTokenService['recordAudit']>[0]): Promise<void> {
    return this.tokens.recordAudit(entry);
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
      const kind: PageKind = last && expected === 'markdown' ? 'markdown' : last && expected ? expected : last ? 'markdown' : 'folder';
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
        (page) =>
          page.parentId === parentId &&
          page.slug === slug &&
          (!kind || page.kind === kind)
      ) ?? null
    );
  }

  private async pathOf(userId: string, workspaceId: string, nodeId: string): Promise<string | null> {
    const tree = await this.listTree(userId, workspaceId);
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
