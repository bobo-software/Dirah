import type { EditorView } from '../editor/viewMode';

export function EditorViewToggle({
  view,
  onChange,
}: {
  view: EditorView;
  onChange: (view: EditorView) => void;
}) {
  return (
    <div className="view-toggle" role="group" aria-label="Editor view">
      <button
        type="button"
        className={view === 'page' ? 'linkish on' : 'linkish'}
        aria-pressed={view === 'page'}
        onClick={() => onChange('page')}
      >
        Page
      </button>
      <button
        type="button"
        className={view === 'edgeless' ? 'linkish on' : 'linkish'}
        aria-pressed={view === 'edgeless'}
        onClick={() => onChange('edgeless')}
      >
        Board
      </button>
    </div>
  );
}
