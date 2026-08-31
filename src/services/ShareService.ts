import crypto from 'node:crypto';
import { and, eq, isNull, or, gt } from 'drizzle-orm';
import { pages, shareLinks, workspaces } from '../db/schemas';
import { HttpError } from '../utils/HttpError';
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
    await this.pages.requireBlockPage(page);
    await this.auth.requireWorkspaceOwner(userId, page.workspaceId);
    const [ws] = await this.database
      .select({ encrypted: workspaces.encrypted })
      .from(workspaces)
      .where(eq(workspaces.id, page.workspaceId))
      .limit(1);
    if (ws?.encrypted) {
      throw new HttpError(
        'Public share is unavailable while end-to-end encryption is on',
        409,
        'E2E_NO_PUBLIC_SHARE'
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
      })
      .from(pages)
      .where(eq(pages.id, link.pageId))
      .limit(1);
    if (!page || page.deletedAt) {
      throw new HttpError('Share link not found', 404, 'SHARE_NOT_FOUND');
    }
    const kind = page.kind === 'folder' || page.kind === 'markdown' ? page.kind : 'page';
    return {
      ...page,
      status: page.status as PublicPage['status'],
      kind,
      slug: page.slug,
      favorited: false,
      token: link.token,
    };
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
