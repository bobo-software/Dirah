import type { AffineEditorContainer } from '@blocksuite/presets';
import { GfxControllerIdentifier } from '@blocksuite/block-std/gfx';
import { Bound } from '@blocksuite/global/utils';

type AwarenessLike = {
  getStates: () => Map<number, unknown>;
  on: (event: 'update', fn: () => void) => void;
  off: (event: 'update', fn: () => void) => void;
};

type SelectionJson = {
  type?: string;
  blockId?: string;
  elements?: unknown;
  from?: { blockId?: string };
};

export function parseRemoteSelection(state: unknown): {
  surfaceIds: string[];
  blockIds: string[];
} {
  const selectionV2 = (state as { selectionV2?: Record<string, SelectionJson[]> } | undefined)
    ?.selectionV2;
  const surfaceIds: string[] = [];
  const blockIds: string[] = [];
  if (!selectionV2) return { surfaceIds, blockIds };
  for (const list of Object.values(selectionV2)) {
    for (const sel of list ?? []) {
      if (sel.type === 'cursor') continue;
      if (sel.type === 'surface') {
        if (Array.isArray(sel.elements)) {
          for (const id of sel.elements) {
            if (typeof id === 'string' && id) surfaceIds.push(id);
          }
        }
        continue;
      }
      const blockId =
        typeof sel.blockId === 'string' && sel.blockId
          ? sel.blockId
          : typeof sel.from?.blockId === 'string'
            ? sel.from.blockId
            : null;
      if (blockId) blockIds.push(blockId);
    }
  }
  return { surfaceIds, blockIds };
}

function panToSurface(editor: AffineEditorContainer, ids: string[]): void {
  try {
    const gfx = editor.std.get(GfxControllerIdentifier);
    const boxes = ids
      .map((id) => gfx.getElementById(id) as { xywh?: string } | null)
      .filter((el): el is { xywh: string } => Boolean(el && typeof el.xywh === 'string'))
      .map((el) => Bound.deserialize(el.xywh));
    if (boxes.length === 0) return;
    let x = Infinity;
    let y = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const box of boxes) {
      x = Math.min(x, box.x);
      y = Math.min(y, box.y);
      x2 = Math.max(x2, box.x + box.w);
      y2 = Math.max(y2, box.y + box.h);
    }
    const bound = new Bound(x, y, Math.max(80, x2 - x), Math.max(80, y2 - y));
    gfx.viewport.setViewportByBound(bound, [80, 80, 80, 80], true);
  } catch {
    /* gfx not mounted yet */
  }
}

function scrollToBlock(editor: AffineEditorContainer, blockId: string): void {
  const el = editor.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`);
  el?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
}

function afterMode(editor: AffineEditorContainer, mode: 'page' | 'edgeless', run: () => void): void {
  if (editor.mode !== mode) {
    editor.mode = mode;
    editor.parentElement?.classList.toggle('is-edgeless', mode === 'edgeless');
    requestAnimationFrame(() => requestAnimationFrame(run));
    return;
  }
  run();
}

export function applyFollow(
  editor: AffineEditorContainer,
  awareness: AwarenessLike,
  clientId: number
): 'page' | 'edgeless' | null {
  const parsed = parseRemoteSelection(awareness.getStates().get(clientId));
  if (parsed.surfaceIds.length > 0) {
    afterMode(editor, 'edgeless', () => panToSurface(editor, parsed.surfaceIds));
    return 'edgeless';
  }
  if (parsed.blockIds.length > 0) {
    const blockId = parsed.blockIds[0];
    afterMode(editor, 'page', () => scrollToBlock(editor, blockId));
    return 'page';
  }
  return null;
}

export function startFollow(
  editor: AffineEditorContainer,
  awareness: AwarenessLike,
  clientId: number,
  options: {
    onMode?: (mode: 'page' | 'edgeless') => void;
    onStop?: () => void;
  } = {}
): () => void {
  let ignoreUntil = 0;
  const bumpIgnore = () => {
    ignoreUntil = Date.now() + 1200;
  };

  const tick = () => {
    bumpIgnore();
    const mode = applyFollow(editor, awareness, clientId);
    if (mode) options.onMode?.(mode);
  };

  const onUserNav = () => {
    if (Date.now() < ignoreUntil) return;
    options.onStop?.();
  };

  tick();
  awareness.on('update', tick);
  editor.addEventListener('wheel', onUserNav, { passive: true });
  editor.addEventListener('pointerdown', onUserNav);

  return () => {
    awareness.off('update', tick);
    editor.removeEventListener('wheel', onUserNav);
    editor.removeEventListener('pointerdown', onUserNav);
  };
}
