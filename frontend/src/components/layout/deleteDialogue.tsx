import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../buttons/Button';
import { registerDeletePresenter, type PendingDelete } from './confirmDelete';

export function DeleteDialogue() {
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const typedRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    registerDeletePresenter((next) => {
      setPending((current) => {
        current?.resolve(false);
        return next;
      });
      setTyped('');
    });
    return () => {
      registerDeletePresenter(null);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const current = pending;
    (current.confirmText !== undefined ? typedRef.current : cancelRef.current)?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      current.resolve(false);
      setPending(null);
      setTyped('');
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pending]);

  function close(confirmed: boolean) {
    pending?.resolve(confirmed);
    setPending(null);
    setTyped('');
  }

  if (!pending) return null;

  const matches = pending.confirmText === undefined || typed.trim() === pending.confirmText.trim();

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
        {pending.confirmText !== undefined ? (
          <form
            className="delete-dialogue-confirm"
            onSubmit={(event) => {
              event.preventDefault();
              if (matches) close(true);
            }}
          >
            <label>
              Type <strong>{pending.confirmText}</strong> to confirm
              <input
                ref={typedRef}
                value={typed}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setTyped(event.target.value)}
              />
            </label>
          </form>
        ) : null}
        <div className="modal-actions">
          <Button variant="link" ref={cancelRef} type="button" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant="danger" type="button" disabled={!matches} onClick={() => close(true)}>
            {pending.confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
