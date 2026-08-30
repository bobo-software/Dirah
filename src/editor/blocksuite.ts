import { AffineSchemas } from '@blocksuite/blocks/schemas';
import { effects as blocksEffects } from '@blocksuite/blocks/effects';
import { AffineEditorContainer } from '@blocksuite/presets';
import { effects as presetsEffects } from '@blocksuite/presets/effects';
import { DocCollection, Schema, Text } from '@blocksuite/store';
import { IndexedDBBlobSource } from '@blocksuite/sync';
import { IndexeddbPersistence, clearDocument } from 'y-indexeddb';
import type { SyncClient } from '../sync/SyncClient';
import { HttpBlobSource } from '../sync/HttpBlobSource';
import { attachPresence } from '../sync/presence';
import { startFollow } from './followCamera';
import { pageToMarkdown } from './markdown';
import type { EditorView } from './viewMode';

function ensureEffects(): void {
  if (customElements.get('affine-editor-container')) return;
  blocksEffects();
  presetsEffects();
}

export function pagePersistenceKey(workspaceId: string, pageId: string): string {
  return `dira:${workspaceId}:${pageId}`;
}

function initEmptyPage(doc: ReturnType<DocCollection['createDoc']>): void {
  const rootId = doc.addBlock('affine:page', {});
  doc.addBlock('affine:surface', {}, rootId);
  const noteId = doc.addBlock('affine:note', {}, rootId);
  doc.addBlock('affine:paragraph', {}, noteId);
}

export type DatabaseViewType = 'table' | 'kanban';

export type MountedPageEditor = {
  destroy: () => Promise<void>;
  exportMarkdown: (fallbackTitle?: string) => string;
  getAskContext: (fallbackTitle?: string) => string;
  setMode: (mode: EditorView) => void;
  insertDatabase: (viewType: DatabaseViewType) => boolean;
  insertText: (text: string) => boolean;
  follow: (
    clientId: number | null,
    hooks?: {
      onMode?: (mode: EditorView) => void;
      onStop?: () => void;
    }
  ) => () => void;
};

const pageLocks = new Map<string, Promise<void>>();

function acquirePageLock(key: string): Promise<() => void> {
  const previous = pageLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  pageLocks.set(key, previous.then(() => held));
  return previous.then(() => release);
}

function waitForRoot(doc: ReturnType<DocCollection['createDoc']>, ms: number): Promise<void> {
  if (doc.root) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    doc.slots.rootAdded.once(finish);
  });
}

export async function mountPageEditor(
  host: HTMLElement,
  options: {
    workspaceId: string;
    pageId: string;
    getToken: () => string | null;
    getShare?: () => string | null;
    sync: SyncClient | null;
    readonly?: boolean;
    seedIfEmpty?: boolean;
    persistenceKey?: string;
    mode?: EditorView;
    displayName?: string;
    docKey?: CryptoKey | null;
  }
): Promise<MountedPageEditor> {
  ensureEffects();
  const key = options.persistenceKey ?? pagePersistenceKey(options.workspaceId, options.pageId);
  const release = await acquirePageLock(key);

  try {
    const schema = new Schema().register(AffineSchemas);
    const collection = new DocCollection({
      id: key,
      schema,
      blobSources: {
        main: new HttpBlobSource({
          workspaceId: options.workspaceId,
          getToken: options.getToken,
          getShare: options.getShare,
          uploads: !options.readonly,
        }),
        shadows: [new IndexedDBBlobSource(key)],
      },
    });
    collection.meta.initialize();
    collection.blobSync.start();
    const doc = collection.createDoc({ id: options.pageId });
    const provider = new IndexeddbPersistence(key, doc.spaceDoc);
    await provider.whenSynced;
    doc.load();
    const empty = doc.spaceDoc.getMap('blocks').size === 0;
    if ((options.seedIfEmpty ?? true) && !options.readonly && empty) {
      initEmptyPage(doc);
    }
    if (options.readonly) {
      const blockCollection = collection.getBlockCollection(options.pageId);
      if (blockCollection) {
        collection.awarenessStore.setReadonly(blockCollection, true);
      }
    }

    const awareness = collection.awarenessStore.awareness;
    const detachPresence = attachPresence(awareness, options.displayName ?? 'Anonymous');

    const unbindSync = options.sync
      ? options.sync.bind(doc.spaceDoc, {
          workspaceId: options.workspaceId,
          docId: options.pageId,
          skipOrigins: [provider],
          canPush: !options.readonly,
          awareness,
          docKey: options.docKey ?? null,
        })
      : () => undefined;

    if (!doc.root) {
      await waitForRoot(doc, 10_000);
    }

    const editor = new AffineEditorContainer();
    editor.doc = doc;
    editor.mode = options.mode ?? 'page';
    editor.autofocus = !options.readonly && editor.mode === 'page';
    host.replaceChildren(editor);
    host.classList.toggle('is-edgeless', editor.mode === 'edgeless');

    return {
      exportMarkdown(fallbackTitle?: string) {
        return pageToMarkdown(doc.root, fallbackTitle ?? doc.meta?.title);
      },
      getAskContext(fallbackTitle?: string) {
        const selected = window.getSelection()?.toString().trim();
        if (selected) return selected;
        return pageToMarkdown(doc.root, fallbackTitle ?? doc.meta?.title);
      },
      setMode(mode: EditorView) {
        editor.mode = mode;
        host.classList.toggle('is-edgeless', mode === 'edgeless');
      },
      insertDatabase(viewType: DatabaseViewType) {
        if (options.readonly) return false;
        const notes = doc.getBlockByFlavour('affine:note');
        const note = notes[0];
        if (!note) return false;
        const id = doc.addBlock('affine:database', {}, note.id);
        const service = editor.std.getService('affine:database') as
          | {
              initDatabaseBlock: (
                d: typeof doc,
                model: unknown,
                databaseId: string,
                type: string,
                append: boolean
              ) => void;
            }
          | null;
        const model = doc.getBlock(id)?.model ?? doc.getBlockById(id);
        if (!model || !service) return Boolean(id);
        service.initDatabaseBlock(doc, model, id, viewType, true);
        return true;
      },
      insertText(text: string) {
        if (options.readonly) return false;
        const notes = doc.getBlockByFlavour('affine:note');
        const note = notes[0];
        if (!note) return false;
        const chunks = text
          .split(/\n{2,}|\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 40);
        if (chunks.length === 0) return false;
        for (const chunk of chunks) {
          doc.addBlock('affine:paragraph', { text: new Text(chunk) }, note.id);
        }
        return true;
      },
      follow(clientId, hooks) {
        if (clientId == null) return () => undefined;
        return startFollow(editor, awareness, clientId, hooks);
      },
      async destroy() {
        try {
          detachPresence();
          unbindSync();
          editor.remove();
          collection.blobSync.stop();
          await provider.destroy();
          collection.dispose();
        } finally {
          release();
        }
      },
    };
  } catch (error) {
    release();
    throw error;
  }
}

export async function deletePagePersistence(workspaceId: string, pageId: string): Promise<void> {
  await clearDocument(pagePersistenceKey(workspaceId, pageId));
}
