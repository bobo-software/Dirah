import crypto from 'node:crypto';
import { and, eq, isNull, or, gt } from 'drizzle-orm';
import { pages, shareLinks } from '../db/schemas';
import { HttpError } from '../utils/HttpError';
import { excerptFromSearchText } from '../utils/slugify';
import { type AuthService, type Database } from './AuthService';
import { type PageService, type PublicPage } from './PageService';

export interface PublicShareLink {
  token: string;
  pageId: string;
  workspaceId: string;
  permission: string;
}

export class ShareService {
  constructor(
    private readonly database: Database,
    private readonly auth: AuthService,
    private readonly pages: PageService
  ) {}

  async getForPage(userId: string, pageId: string): Promise<PublicShareLink | null> {
    const page = await this.pages.requireMemberPage(userId, pageId);
    await this.auth.requireWorkspaceOwner(userId, page.workspaceId);
    return this.activeLink(pageId);
  }

  async create(userId: string, pageId: string, permission: string): Promise<PublicShareLink> {
    if (permission !== 'view') {
      throw new HttpError('Only view links are supported', 400, 'INVALID_PERMISSION');
    }
    const page = await this.pages.requireMemberPage(userId, pageId);
    await this.pages.requireMarkdownPage(page);
    await this.auth.requireWorkspaceOwner(userId, page.workspaceId);
    if (await this.pages.isWorkspaceEncrypted(page.workspaceId)) {
      throw new HttpError(
        'Sharing is unavailable because this workspace is encrypted',
        409,
        'WORKSPACE_ENCRYPTED'
      );
    }
    const existing = await this.activeLink(pageId);
    if (existing) {
      return existing;
    }
    const token = crypto.randomBytes(18).toString('base64url');
    const [row] = await this.database
      .insert(shareLinks)
      .values({
        token,
        pageId: page.id,
        workspaceId: page.workspaceId,
        permission: 'view',
        createdBy: userId,
      })
      .returning({
        token: shareLinks.token,
        pageId: shareLinks.pageId,
        workspaceId: shareLinks.workspaceId,
        permission: shareLinks.permission,
      });
    return row;
  }

  async revoke(userId: string, pageId: string): Promise<void> {
    const page = await this.pages.requireMemberPage(userId, pageId);
    await this.auth.requireWorkspaceOwner(userId, page.workspaceId);
    await this.database
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(shareLinks.pageId, pageId), isNull(shareLinks.revokedAt)));
  }

  async requireActive(token: string, docId?: string): Promise<PublicPage & { token: string }> {
    const link = await this.findActive(token);
    if (!link) {
      throw new HttpError('Share link not found', 404, 'SHARE_NOT_FOUND');
    }
    if (docId && link.pageId !== docId) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN');
    }
    const [page] = await this.database
      .select({
        id: pages.id,
        workspaceId: pages.workspaceId,
        title: pages.title,
        parentId: pages.parentId,
        position: pages.position,
        deletedAt: pages.deletedAt,
        status: pages.status,
        kind: pages.kind,
        slug: pages.slug,
        createdAt: pages.createdAt,
        searchText: pages.searchText,
      })
      .from(pages)
      .where(eq(pages.id, link.pageId))
      .limit(1);
    if (!page || page.deletedAt) {
      throw new HttpError('Share link not found', 404, 'SHARE_NOT_FOUND');
    }
    const kind: PublicPage['kind'] = page.kind === 'folder' ? 'folder' : 'markdown';
    return {
      ...page,
      status: page.status as PublicPage['status'],
      kind,
      slug: page.slug,
      favorited: false,
      excerpt: excerptFromSearchText(page.searchText),
      token: link.token,
    };
  }

  async getPublicMarkdown(token: string): Promise<{
    page: PublicPage & { token: string };
    content: string;
    hash: string;
    updatedAt: Date;
  }> {
    const page = await this.requireActive(token);
    await this.pages.requireMarkdownPage(page);
    if (await this.pages.isWorkspaceEncrypted(page.workspaceId)) {
      throw new HttpError(
        'Sharing is unavailable because this workspace is encrypted',
        409,
        'WORKSPACE_ENCRYPTED'
      );
    }
    const body = await this.pages.loadMarkdownBody(page.id);
    if (!body) {
      throw new HttpError('Markdown body not found', 404, 'MARKDOWN_NOT_FOUND');
    }
    return { page, ...body };
  }

  async requireWorkspace(token: string, workspaceId: string): Promise<PublicPage & { token: string }> {
    const page = await this.requireActive(token);
    if (page.workspaceId !== workspaceId) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN');
    }
    return page;
  }

  private async activeLink(pageId: string): Promise<PublicShareLink | null> {
    const [row] = await this.database
      .select({
        token: shareLinks.token,
        pageId: shareLinks.pageId,
        workspaceId: shareLinks.workspaceId,
        permission: shareLinks.permission,
      })
      .from(shareLinks)
      .where(and(eq(shareLinks.pageId, pageId), isNull(shareLinks.revokedAt), this.notExpired()))
      .limit(1);
    return row ?? null;
  }

  private async findActive(token: string): Promise<PublicShareLink | null> {
    const [row] = await this.database
      .select({
        token: shareLinks.token,
        pageId: shareLinks.pageId,
        workspaceId: shareLinks.workspaceId,
        permission: shareLinks.permission,
      })
      .from(shareLinks)
      .where(and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt), this.notExpired()))
      .limit(1);
    return row ?? null;
  }

  private notExpired() {
    return or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, new Date()));
  }
}
