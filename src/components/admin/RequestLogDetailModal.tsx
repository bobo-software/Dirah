import { useEffect } from 'react';
import type { AdminRequestLogRow } from '../../api/admin';

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type Props = {
  log: AdminRequestLogRow;
  onClose: () => void;
};

export function RequestLogDetailModal({ log, onClose }: Props) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal request-log-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-log-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={log.success ? 'request-log-modal-head ok' : 'request-log-modal-head fail'}>
          <div>
            <h2 id="request-log-modal-title">
              {log.method} {log.statusCode}
            </h2>
            <p className="request-log-modal-id">{log.id}</p>
          </div>
          <button type="button" className="request-log-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="request-log-modal-body">
          <section className="request-log-section">
            <span className="request-log-label">URL</span>
            <pre className="request-log-code request-log-url">{log.url}</pre>
          </section>

          <div className="request-log-meta">
            <article>
              <span className="request-log-label">Duration</span>
              <strong>{log.durationMs}ms</strong>
            </article>
            <article>
              <span className="request-log-label">Timestamp</span>
              <strong>{new Date(log.createdAt).toLocaleString()}</strong>
            </article>
            <article>
              <span className="request-log-label">IP</span>
              <strong>{log.ip ?? '—'}</strong>
            </article>
            <article>
              <span className="request-log-label">User</span>
              <strong className="admin-mono">{log.userId ?? '—'}</strong>
            </article>
            <article>
              <span className="request-log-label">Role</span>
              <strong>{log.userRole ?? '—'}</strong>
            </article>
            <article>
              <span className="request-log-label">Message</span>
              <strong>{log.message}</strong>
            </article>
          </div>

          <section className="request-log-section">
            <span className="request-log-label">Request payload</span>
            <pre className="request-log-code">{formatJson(log.requestBody)}</pre>
          </section>

          <section className="request-log-section">
            <span className="request-log-label">Response data</span>
            <pre className="request-log-code request-log-response">{formatJson(log.responseBody)}</pre>
          </section>
        </div>
      </div>
    </div>
  );
}

export default RequestLogDetailModal;
