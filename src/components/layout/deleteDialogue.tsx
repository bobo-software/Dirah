import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../buttons/Button';

type PendingDelete = {
  title: string;
  message: string;
  confirmLabel: string;
  resolve: (confirmed: boolean) => void;
};

let present: ((pending: PendingDelete) => void) | null = null;

export function confirmDelete(request: {
  title?: string;
  message: string;
  confirmLabel?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const pending: PendingDelete = {
      title: request.title ?? 'Delete this?',
      message: request.message,
      confirmLabel: request.confirmLabel ?? 'Delete',
      resolve,
    };
    if (!present) {
      resolve(false);
      return;
    }
    present(pending);
  });
}

export function DeleteDialogue() {
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    present = (next) => {
      setPending((current) => {
        current?.resolve(false);
        return next;
      });
    };
    return () => {
      present = null;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const current = pending;
    cancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      current.resolve(false);
      setPending(null);
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pending]);

  function close(confirmed: boolean) {
    pending?.resolve(confirmed);
    setPending(null);
  }

  if (!pending) return null;

  return createPortal(
    <div className="modal-backdrop delete-dialogue-backdrop" role="presentation" onClick={() => close(false)}>
      <div
        className="modal delete-dialogue"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{pending.title}</h2>
        <p id={messageId}>{pending.message}</p>
        <div className="modal-actions">
          <Button variant="link" ref={cancelRef} type="button" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant="danger" type="button" onClick={() => close(true)}>
            {pending.confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
