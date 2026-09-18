import { useState } from 'react'
import { useLinksStore } from '../store/links-store'
import ConfirmDialog from './ConfirmDialog'

export default function BulkActionBar() {
  const count = useLinksStore((state) => state.selectedIds.length)
  const labels = useLinksStore((state) => state.labels)
  const bulkUpdate = useLinksStore((state) => state.bulkUpdate)
  const bulkDelete = useLinksStore((state) => state.bulkDelete)
  const clearLabel = useLinksStore((state) => state.clearLabel)
  const clearSelection = useLinksStore((state) => state.clearSelection)
  const selectAllVisible = useLinksStore((state) => state.selectAllVisible)
  const selectAllMatching = useLinksStore((state) => state.selectAllMatching)
  const [confirming, setConfirming] = useState(false)

  if (count === 0) return null

  const actionClass =
    'rounded-md border border-subtle px-2.5 py-1 text-xs text-primary transition hover:border-strong hover:bg-hover'

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-subtle bg-panel px-4 py-1.5 text-xs">
        <span className="mr-1 font-medium text-primary">{count} selected</span>

        <button type="button" className={actionClass} onClick={selectAllVisible}>
          Select loaded
        </button>
        <button
          type="button"
          className={actionClass}
          onClick={() => void selectAllMatching()}
          title="Select every link matching the current filters, not just the loaded page"
        >
          Select matching
        </button>

        <button type="button" className={actionClass} onClick={() => void bulkUpdate({ isRead: true })}>
          Mark read
        </button>
        <button
          type="button"
          className={actionClass}
          onClick={() => void bulkUpdate({ isRead: false })}
        >
          Mark unread
        </button>
        <button
          type="button"
          className={actionClass}
          onClick={() => void bulkUpdate({ isArchived: true })}
        >
          Archive
        </button>
        <button
          type="button"
          className={actionClass}
          onClick={() => void bulkUpdate({ isArchived: false })}
        >
          Unarchive
        </button>

        <select
          defaultValue=""
          onChange={(event) => {
            if (event.target.value.length > 0) {
              void bulkUpdate({ label: event.target.value })
              event.target.value = ''
            }
          }}
          className="rounded-md border border-subtle bg-raised px-2 py-1 text-xs outline-none transition focus:border-accent/60"
        >
          <option value="">Move to label…</option>
          {labels.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
        <button type="button" className={actionClass} onClick={() => void clearLabel()}>
          Clear label
        </button>

        <button
          type="button"
          className="rounded-md px-2.5 py-1 text-xs text-danger transition hover:bg-danger/10"
          onClick={() => setConfirming(true)}
        >
          Delete
        </button>

        <button
          type="button"
          className="ml-auto text-xs text-muted transition hover:text-primary"
          onClick={clearSelection}
        >
          Clear selection
        </button>
      </div>

      {confirming ? (
        <ConfirmDialog
          title={`Delete ${count} links`}
          message="The selected links will be permanently deleted. You can undo immediately after."
          confirmLabel="Delete"
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            await bulkDelete()
            setConfirming(false)
          }}
        />
      ) : null}
    </>
  )
}
