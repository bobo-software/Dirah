import { useEditorViewStore } from '../../stores/StoresIndex';

export function PreferencesSection() {
  const showSource = useEditorViewStore((state) => state.showSource);
  const setShowSource = useEditorViewStore((state) => state.setShowSource);

  return (
    <div className="settings-section">
      <h2>Preferences</h2>
      <label className="settings-toggle-row">
        <input type="checkbox" checked={showSource} onChange={(event) => setShowSource(event.target.checked)} />
        <span>
          <strong>Show markdown source by default</strong>
          <span className="muted"> — reveal the editor pane alongside the preview when you open a document.</span>
        </span>
      </label>
    </div>
  );
}
