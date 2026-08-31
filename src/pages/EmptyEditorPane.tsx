export function EmptyEditorPane({
  onCreate,
  busy,
  hasPages,
  allowCreate = true,
  allowDocs = true,
}: {
  onCreate: (kind: 'page' | 'folder' | 'markdown') => void;
  busy: boolean;
  hasPages: boolean;
  allowCreate?: boolean;
  allowDocs?: boolean;
}) {
  return (
    <section className="editor-placeholder">
      <div>
        <p className="muted">{hasPages ? 'Select a page or create another.' : 'No page selected.'}</p>
        {allowCreate ? (
          <div className="folder-actions">
            <button type="button" onClick={() => onCreate('page')} disabled={busy}>
              {busy ? 'Creating…' : hasPages ? 'New page' : 'Create your first page'}
            </button>
            {allowDocs ? (
              <>
                <button type="button" onClick={() => onCreate('folder')} disabled={busy}>
                  New folder
                </button>
                <button type="button" onClick={() => onCreate('markdown')} disabled={busy}>
                  New markdown
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
