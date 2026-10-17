import { useEffect } from 'react';
import type { AdminMcpAuditRow } from '../../api/admin';
import { Button } from '../buttons/Button';

type Props = {
  row: AdminMcpAuditRow;
  onClose: () => void;
};

export function McpAuditDetailModal({ row, onClose }: Props) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const ok = row.outcome === 'ok' || row.outcome === 'success';

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal request-log-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-audit-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={ok ? 'request-log-modal-head ok' : 'request-log-modal-head fail'}>
          <div>
            <h2 id="mcp-audit-modal-title">
              {row.tool} · {row.outcome}
            </h2>
            <p className="request-log-modal-id">{row.id}</p>
          </div>
          <Button variant="plain" type="button" className="request-log-modal-close" onClick={onClose} aria-label="Close">
            ×
          </Button>
        </header>
        <div className="request-log-modal-body">
          <div className="request-log-meta">
            <article>
              <span className="request-log-label">Timestamp</span>
              <strong>{new Date(row.createdAt).toLocaleString()}</strong>
            </article>
            <article>
              <span className="request-log-label">Tool</span>
              <strong>{row.tool}</strong>
            </article>
            <article>
              <span className="request-log-label">Outcome</span>
              <strong>{row.outcome}</strong>
            </article>
            <article>
              <span className="request-log-label">User</span>
              <strong className="admin-mono">{row.userId ?? '—'}</strong>
            </article>
            <article>
              <span className="request-log-label">Workspace</span>
              <strong className="admin-mono">{row.workspaceId ?? '—'}</strong>
            </article>
            <article>
              <span className="request-log-label">Token</span>
              <strong className="admin-mono">{row.tokenId ?? '—'}</strong>
            </article>
            <article>
              <span className="request-log-label">Node</span>
              <strong className="admin-mono">{row.nodeId ?? '—'}</strong>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
