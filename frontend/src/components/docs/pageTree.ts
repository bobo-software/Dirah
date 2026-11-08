import type { PublicPage } from '../../api/client';

export type PageNode = {
  page: PublicPage;
  children: PageNode[];
};

export function buildPageTree(pages: PublicPage[]): PageNode[] {
  const ids = new Set(pages.map((page) => page.id));
  const byParent = new Map<string | null, PublicPage[]>();
  for (const page of pages) {
    const parentId = page.parentId && ids.has(page.parentId) ? page.parentId : null;
    const list = byParent.get(parentId) ?? [];
    list.push(page);
    byParent.set(parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  }
  const nest = (parentId: string | null): PageNode[] =>
    (byParent.get(parentId) ?? []).map((page) => ({
      page,
      children: nest(page.id),
    }));
  return nest(null);
}

export function draggedPageId(data: DataTransfer): string {
  return data.getData('text/page-id') || data.getData('text/plain');
}
