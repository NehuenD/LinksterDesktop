import { useEffect, useState } from 'react'
import { useLinksStore } from '../store/links-store'

export interface UndoToastViewProps {
  /** Number of items staged for undo; 0 hides the bar. */
  itemCount: number
  expiresAt: number | null
  onUndo: () => void
  onDismiss: () => void
  /** Singular noun used in the message ("Link", "Post"). */
  noun?: string
}

/** Presentational undo bar shared by the library and the isolated sections. */
export function UndoToastView({
  itemCount,
  expiresAt,
  onUndo,
  onDismiss,
  noun = 'Link'
}: UndoToastViewProps) {
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (expiresAt === null) return

    const tick = (): void => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining <= 0) onDismiss()
    }

    tick()
    const timer = setInterval(tick, 500)
    return () => clearInterval(timer)
  }, [expiresAt, onDismiss])

  if (itemCount === 0) return null

  return (
    <div className="fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-subtle bg-panel px-3 py-1.5 text-xs shadow-panel backdrop-blur">
      <span className="text-muted">
        {itemCount === 1 ? `${noun} deleted.` : `${itemCount} ${noun.toLowerCase()}s deleted.`}
      </span>
      <button
        type="button"
        onClick={onUndo}
        className="font-medium text-accent transition hover:brightness-125"
      >
        Undo
      </button>
      <span className="tabular-nums text-muted/70" aria-hidden="true">
        {secondsLeft}s
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-muted transition hover:text-primary"
      >
        Dismiss
      </button>
    </div>
  )
}

export default function UndoToast() {
  const lastDeleted = useLinksStore((state) => state.lastDeleted)
  const undoExpiresAt = useLinksStore((state) => state.undoExpiresAt)
  const undoDelete = useLinksStore((state) => state.undoDelete)
  const dismissUndo = useLinksStore((state) => state.dismissUndo)

  // The undo affordance is library-scoped: leaving the view unmounts this toast
  // and clears any pending undo so it cannot reappear on return.
  useEffect(() => () => useLinksStore.getState().dismissUndo(), [])

  return (
    <UndoToastView
      itemCount={lastDeleted?.length ?? 0}
      expiresAt={undoExpiresAt}
      onUndo={() => void undoDelete()}
      onDismiss={dismissUndo}
    />
  )
}
