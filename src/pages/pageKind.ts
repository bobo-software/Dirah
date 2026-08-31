export function pageKind(page: { kind?: string | null }): 'page' | 'folder' | 'markdown' {
  if (page.kind === 'folder' || page.kind === 'markdown') return page.kind;
  return 'page';
}

export function kindLabel(kind: 'page' | 'folder' | 'markdown'): string {
  if (kind === 'folder') return 'Folder';
  if (kind === 'markdown') return 'Markdown';
  return 'Page';
}

export function kindGlyph(kind: 'page' | 'folder' | 'markdown'): string {
  if (kind === 'folder') return '📁';
  if (kind === 'markdown') return 'MD';
  return 'P';
}

export function canHaveChildren(kind: 'page' | 'folder' | 'markdown'): boolean {
  return kind !== 'markdown';
}
