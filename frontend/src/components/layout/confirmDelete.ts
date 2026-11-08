export type PendingDelete = {
  title: string;
  message: string;
  confirmLabel: string;
  /** When set, the person must type this exactly before Delete enables. */
  confirmText?: string;
  resolve: (confirmed: boolean) => void;
};

type Presenter = (pending: PendingDelete) => void;

let present: Presenter | null = null;

/** Called by the mounted DeleteDialogue so confirmDelete can reach it. */
export function registerDeletePresenter(presenter: Presenter | null): void {
  present = presenter;
}

export function confirmDelete(request: {
  title?: string;
  message: string;
  confirmLabel?: string;
  confirmText?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const pending: PendingDelete = {
      title: request.title ?? 'Delete this?',
      message: request.message,
      confirmLabel: request.confirmLabel ?? 'Delete',
      confirmText: request.confirmText,
      resolve,
    };
    if (!present) {
      resolve(false);
      return;
    }
    present(pending);
  });
}
