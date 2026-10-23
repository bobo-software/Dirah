export function pageKind(page: { kind?: string | null }): 'folder' | 'markdown' {
  return page.kind === 'folder' ? 'folder' : 'markdown';
}

export function kindLabel(kind: 'folder' | 'markdown'): string {
  return kind === 'folder' ? 'Folder' : 'Markdown';
}

export function kindGlyph(kind: 'folder' | 'markdown'): string {
  return kind === 'folder' ? '📁' : 'MD';
}

export function canHaveChildren(kind: 'folder' | 'markdown'): boolean {
  return kind === 'folder';
}
