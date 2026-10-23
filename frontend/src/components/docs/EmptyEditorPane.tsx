import { Button } from '../buttons/Button';
export function EmptyEditorPane({
  onCreate,
  busy,
  hasPages,
  allowCreate = true,
}: {
  onCreate: (kind: 'folder' | 'markdown') => void;
  busy: boolean;
  hasPages: boolean;
  allowCreate?: boolean;
}) {
  return (
    <section className="editor-placeholder">
      <div>
        <p className="muted">{hasPages ? 'Select a document or create another.' : 'No document selected.'}</p>
        {allowCreate ? (
          <div className="folder-actions">
            <Button type="button" onClick={() => onCreate('markdown')} disabled={busy}>
              {busy ? 'Creating…' : hasPages ? 'New markdown' : 'Create your first document'}
            </Button>
            <Button type="button" onClick={() => onCreate('folder')} disabled={busy}>
              New folder
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
