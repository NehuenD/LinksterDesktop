import { useLinksStore } from '../store/links-store'

export default function UndoToast() {
  const lastDeleted = useLinksStore((state) => state.lastDeleted)
  const undoDelete = useLinksStore((state) => state.undoDelete)
  const dismissUndo = useLinksStore((state) => state.dismissUndo)

  if (!lastDeleted || lastDeleted.length === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-subtle bg-surface px-4 py-2 text-sm shadow-2xl">
      <span className="text-muted">
        {lastDeleted.length === 1 ? 'Link deleted.' : `${lastDeleted.length} links deleted.`}
      </span>
      <button
        type="button"
        onClick={() => void undoDelete()}
        className="font-medium text-accent transition hover:opacity-80"
      >
        Undo
      </button>
      <button
        type="button"
        onClick={dismissUndo}
        className="text-muted transition hover:text-primary"
      >
        Dismiss
      </button>
    </div>
  )
}
