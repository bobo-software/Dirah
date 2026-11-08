import { useAssetUploadStore } from '../../stores/StoresIndex';
import { Button } from '../buttons/Button';

/** Progress of media uploads in this workspace. Finished rows clear themselves; failures wait to be dismissed. */
export function UploadTray({ workspaceId }: { workspaceId: string }) {
  const uploads = useAssetUploadStore((state) => state.uploads).filter((item) => item.workspaceId === workspaceId);
  const dismiss = useAssetUploadStore((state) => state.dismiss);
  if (!uploads.length) return null;
  return (
    <ul className="upload-tray" aria-live="polite">
      {uploads.map((item) => (
        <li key={item.key} className={`upload-row ${item.state}`}>
          <span className="upload-name" title={item.name}>
            {item.name}
          </span>
          {item.state === 'uploading' ? (
            <span className="upload-bar" role="progressbar" aria-valuenow={Math.round(item.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
            </span>
          ) : item.state === 'done' ? (
            <span className="upload-status">Uploaded</span>
          ) : (
            <>
              <span className="upload-status error" title={item.error}>
                {item.error}
              </span>
              <Button variant="link" type="button" aria-label="Dismiss" onClick={() => dismiss(item.key)}>
                ×
              </Button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
