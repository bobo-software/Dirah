export function EmptyEditorPane({
  onCreate,
  busy,
  hasPages,
  allowCreate = true,
}: {
  onCreate: () => void;
  busy: boolean;
  hasPages: boolean;
  allowCreate?: boolean;
}) {
  return (
    <section className="editor-placeholder">
      <div>
        <p className="muted">{hasPages ? 'Select a page or create another.' : 'No page selected.'}</p>
        {allowCreate ? (
          <button type="button" onClick={onCreate} disabled={busy}>
            {busy ? 'Creating…' : hasPages ? 'New page' : 'Create your first page'}
          </button>
        ) : null}
      </div>
    </section>
  );
}

