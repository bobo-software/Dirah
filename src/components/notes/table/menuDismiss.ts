let dismissOpen: (() => void) | null = null

export function exclusive(close: () => void) {
  if (dismissOpen && dismissOpen !== close) dismissOpen()
  dismissOpen = close
}

export function release(close: () => void) {
  if (dismissOpen === close) dismissOpen = null
}

export function dismiss() {
  dismissOpen?.()
}
