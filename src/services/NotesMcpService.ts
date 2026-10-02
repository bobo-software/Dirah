import { HttpError } from '../utils/HttpError';
import { applyMarkdownEdit, type MarkdownEditInput } from './mcp/markdownPatch';
import type { DocsMcpService } from './DocsMcpService';
import {
  type NoteScope,
  type NoteService,
  type NoteVisibility,
  type PublicNote,
} from './NoteService';

export interface NoteListRow {
  id: string;
  title: string;
  parentId: string | null;
  visibility: NoteVisibility;
  editable: boolean;
  icon: string | null;
  pinned: boolean;
  excerpt: string;
  tagIds: string[];
  breadcrumb: string[];
  url: string;
}

export interface NoteReadResult extends NoteListRow {
  cover: string | null;
  content: string;
  hash: string;
  updatedAt: Date;
  startLine: number;
  endLine: number;
  totalLines: number;
}

function breadcrumbTitles(all: PublicNote[], noteId: string): string[] {
  const byId = new Map(all.map((note) => [note.id, note]));
  const titles: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(noteId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    titles.push(current.title);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return titles.reverse();
}

function sliceContent(content: string, startLine?: number, maxLines?: number) {
  const lines = content.split('\n');
  const totalLines = lines.length;
  const start = Math.max(1, Math.floor(startLine ?? 1));
  const max = maxLines != null ? Math.max(1, Math.floor(maxLines)) : undefined;
  const sliced =
    startLine != null || max != null
      ? lines.slice(start - 1, max != null ? start - 1 + max : undefined)
      : lines;
  const endLine = Math.min(totalLines, start - 1 + sliced.length);
  return {
    content: sliced.join('\n'),
    startLine: start,
    endLine: sliced.length ? endLine : start - 1,
    totalLines,
  };
}

function plainSnippet(content: string, query: string): string {
  const plain = content.replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  const needle = query.trim().toLowerCase();
  const hay = plain.toLowerCase();
  let idx = needle ? hay.indexOf(needle) : -1;
  if (idx < 0 && needle.includes(' ')) {
    const first = needle.split(/\s+/).find((part) => part.length > 2);
    if (first) idx = hay.indexOf(first);
  }
  if (idx < 0) return plain.slice(0, 160);
  const start = Math.max(0, idx - 40);
  return plain.slice(start, Math.min(plain.length, start + 160));
}

export class NotesMcpService {
  constructor(
    private readonly notes: NoteService,
    private readonly docs: DocsMcpService,
    private readonly options: { appPublicUrl?: string } = {}
  ) {}

  noteUrl(workspaceId: string, noteId: string): string {
    const origin = (this.options.appPublicUrl ?? '').replace(/\/$/, '') || 'http://localhost:5181';
    return `${origin}/w/${workspaceId}/n/${noteId}`;
  }

  recordAudit(entry: Parameters<DocsMcpService['recordAudit']>[0]): Promise<void> {
    return this.docs.recordAudit(entry);
  }

  async listNotes(
    userId: string,
    tokenId: string | null,
    ref: string | undefined,
    options: {
      defaultWorkspaceId?: string | null;
      scope?: NoteScope;
      parentId?: string | null;
      q?: string;
    } = {}
  ): Promise<NoteListRow[]> {
    const workspace = await this.docs.resolveWorkspace(userId, tokenId, ref, {
      defaultWorkspaceId: options.defaultWorkspaceId,
    });
    if (!workspace) {
      throw new HttpError('workspace or workspaceId is required', 400, 'WORKSPACE_REQUIRED');
    }
    await this.docs.requireWorkspaceAccess(userId, tokenId, workspace.workspaceId, false);
    if (options.parentId) {
      const parent = await this.notes.get(userId, options.parentId);
      if (parent.note.workspaceId !== workspace.workspaceId) {
        throw new HttpError('Note not found', 404, 'NOTE_NOT_FOUND');
      }
    }
    const all = await this.notes.list(userId, workspace.workspaceId, { scope: options.scope });
    const matched = options.q
      ? await this.notes.list(userId, workspace.workspaceId, { scope: options.scope, q: options.q })
      : all;
    const rows =
      options.parentId === undefined
        ? matched
        : matched.filter((note) => note.parentId === options.parentId);
    return rows.map((note) => this.toListRow(note, all));
  }

  async readNote(
    userId: string,
    tokenId: string | null,
    noteId: string,
    options: { workspaceRef?: string; startLine?: number; maxLines?: number } = {}
  ): Promise<NoteReadResult> {
    const body = await this.visibleNote(userId, tokenId, noteId, false, options.workspaceRef);
    const all = await this.notes.list(userId, body.note.workspaceId);
    const sliced = sliceContent(body.content, options.startLine, options.maxLines);
    return {
      ...this.toListRow(body.note, all),
      cover: body.note.cover,
      content: sliced.content,
      hash: body.hash,
      updatedAt: body.updatedAt,
      startLine: sliced.startLine,
      endLine: sliced.endLine,
      totalLines: sliced.totalLines,
    };
  }

  async searchNotes(
    userId: string,
    tokenId: string | null,
    ref: string | null | undefined,
    q: string,
    limit = 20
  ) {
    const cap = Math.min(50, Math.max(1, limit));
    const resolved = await this.docs.resolveWorkspace(userId, tokenId, ref, { optional: true });
    const allowed = await this.docs.listWorkspaces(userId, tokenId);
    const targets = resolved
      ? allowed.filter((row) => row.workspaceId === resolved.workspaceId)
      : allowed;
    if (!targets.length) {
      throw new HttpError('Workspace is not allowlisted for MCP', 403, 'MCP_NOT_ALLOWLISTED');
    }
    const hits: Array<{
      id: string;
      title: string;
      workspaceId: string;
      workspace: string;
      visibility: NoteVisibility;
      editable: boolean;
      snippet: string;
      url: string;
    }> = [];
    outer: for (const workspace of targets) {
      await this.docs.requireWorkspaceAccess(userId, tokenId, workspace.workspaceId, false);
      const found = await this.notes.list(userId, workspace.workspaceId, { q });
      for (const note of found) {
        const body = await this.notes.get(userId, note.id);
        hits.push({
          id: note.id,
          title: note.title,
          workspaceId: note.workspaceId,
          workspace: workspace.slug,
          visibility: note.visibility,
          editable: note.editable,
          snippet: plainSnippet(body.content, q) || note.title,
          url: this.noteUrl(note.workspaceId, note.id),
        });
        if (hits.length >= cap) break outer;
      }
    }
    return hits;
  }

  async writeNote(
    userId: string,
    tokenId: string | null,
    input: {
      workspaceRef?: string;
      defaultWorkspaceId?: string | null;
      noteId?: string;
      title?: string;
      parentId?: string | null;
      visibility?: NoteVisibility;
      content?: string;
      hash?: string;
    }
  ): Promise<NoteReadResult> {
    if (input.noteId) {
      if (input.content === undefined) {
        throw new HttpError('content is required', 400, 'INVALID_ARGS');
      }
      if (input.title !== undefined || input.parentId !== undefined || input.visibility !== undefined) {
        throw new HttpError(
          'title, parentId, and visibility apply only when creating a note',
          400,
          'INVALID_ARGS'
        );
      }
      const current = await this.visibleNote(userId, tokenId, input.noteId, true, input.workspaceRef);
      const body = await this.notes.putContent(userId, input.noteId, input.content, input.hash);
      const all = await this.notes.list(userId, current.note.workspaceId);
      return this.toReadResult(body.note, body.content, body.hash, body.updatedAt, all);
    }

    const workspace = await this.docs.resolveWorkspace(userId, tokenId, input.workspaceRef, {
      defaultWorkspaceId: input.defaultWorkspaceId,
    });
    if (!workspace) {
      throw new HttpError('workspace or workspaceId is required', 400, 'WORKSPACE_REQUIRED');
    }
    await this.docs.requireWorkspaceAccess(userId, tokenId, workspace.workspaceId, true);
    const created = await this.notes.create(userId, workspace.workspaceId, {
      title: input.title,
      parentId: input.parentId,
      visibility: input.visibility,
    });
    const body =
      input.content !== undefined
        ? await this.notes.putContent(userId, created.id, input.content)
        : await this.notes.get(userId, created.id);
    const all = await this.notes.list(userId, workspace.workspaceId);
    return this.toReadResult(body.note, body.content, body.hash, body.updatedAt, all);
  }

  async editNote(
    userId: string,
    tokenId: string | null,
    input: MarkdownEditInput & { noteId: string; hash?: string; workspaceRef?: string }
  ): Promise<NoteReadResult> {
    const current = await this.visibleNote(userId, tokenId, input.noteId, true, input.workspaceRef);
    const next = applyMarkdownEdit(current.content, input, input.noteId, current.hash);
    const body = await this.notes.putContent(userId, input.noteId, next, input.hash ?? current.hash);
    const all = await this.notes.list(userId, current.note.workspaceId);
    return this.toReadResult(body.note, body.content, body.hash, body.updatedAt, all);
  }

  async updateNote(
    userId: string,
    tokenId: string | null,
    input: {
      noteId: string;
      workspaceRef?: string;
      title?: string;
      icon?: string | null;
      cover?: string | null;
      parentId?: string | null;
      position?: number;
      visibility?: NoteVisibility;
      pinned?: boolean;
    }
  ): Promise<NoteListRow & { cover: string | null }> {
    const current = await this.visibleNote(userId, tokenId, input.noteId, true, input.workspaceRef);
    const updated = await this.notes.patch(userId, input.noteId, {
      title: input.title,
      icon: input.icon,
      cover: input.cover,
      parentId: input.parentId,
      position: input.position,
      visibility: input.visibility,
      pinned: input.pinned,
    });
    const all = await this.notes.list(userId, current.note.workspaceId);
    return { ...this.toListRow(updated, all), cover: updated.cover };
  }

  async trashNote(
    userId: string,
    tokenId: string | null,
    noteId: string,
    workspaceRef?: string
  ): Promise<{ id: string; trashed: true }> {
    await this.visibleNote(userId, tokenId, noteId, true, workspaceRef);
    await this.notes.trash(userId, noteId);
    return { id: noteId, trashed: true };
  }

  private async visibleNote(
    userId: string,
    tokenId: string | null,
    noteId: string,
    write: boolean,
    workspaceRef?: string
  ) {
    const body = await this.notes.get(userId, noteId);
    if (workspaceRef) {
      const resolved = await this.docs.resolveWorkspace(userId, tokenId, workspaceRef);
      if (!resolved || resolved.workspaceId !== body.note.workspaceId) {
        throw new HttpError('Note not found', 404, 'NOTE_NOT_FOUND');
      }
    }
    await this.docs.requireWorkspaceAccess(userId, tokenId, body.note.workspaceId, write);
    return body;
  }

  private toListRow(note: PublicNote, all: PublicNote[]): NoteListRow {
    return {
      id: note.id,
      title: note.title,
      parentId: note.parentId,
      visibility: note.visibility,
      editable: note.editable,
      icon: note.icon,
      pinned: note.pinnedAt != null,
      excerpt: note.excerpt,
      tagIds: note.tagIds,
      breadcrumb: breadcrumbTitles(all, note.id),
      url: this.noteUrl(note.workspaceId, note.id),
    };
  }

  private toReadResult(
    note: PublicNote,
    content: string,
    hash: string,
    updatedAt: Date,
    all: PublicNote[]
  ): NoteReadResult {
    const sliced = sliceContent(content);
    return {
      ...this.toListRow(note, all),
      cover: note.cover,
      content,
      hash,
      updatedAt,
      startLine: sliced.startLine,
      endLine: sliced.endLine,
      totalLines: sliced.totalLines,
    };
  }
}
