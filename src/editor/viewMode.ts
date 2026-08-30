export type EditorView = 'page' | 'edgeless';

export function parseEditorView(value: string | null | undefined): EditorView {
  return value === 'edgeless' ? 'edgeless' : 'page';
}

export function viewStorageKey(workspaceId: string, pageId: string): string {
  return `dira:view:${workspaceId}:${pageId}`;
}

export function readStoredView(workspaceId: string, pageId: string): EditorView {
  try {
    return parseEditorView(localStorage.getItem(viewStorageKey(workspaceId, pageId)));
  } catch {
    return 'page';
  }
}

export function storeView(workspaceId: string, pageId: string, view: EditorView): void {
  try {
    localStorage.setItem(viewStorageKey(workspaceId, pageId), view);
  } catch {
    /* ignore quota / private mode */
  }
}
