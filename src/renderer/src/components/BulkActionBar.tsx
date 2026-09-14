import { useState } from 'react'
import { useLinksStore } from '../store/links-store'
import ConfirmDialog from './ConfirmDialog'

export default function BulkActionBar() {
  const count = useLinksStore((state) => state.selectedIds.length)
  const labels = useLinksStore((state) => state.labels)
  const bulkUpdate = useLinksStore((state) => state.bulkUpdate)
  const bulkDelete = useLinksStore((state) => state.bulkDelete)
  const clearSelection = useLinksStore((state) => state.clearSelection)
  const selectAllVisible = useLinksStore((state) => state.selectAllVisible)
  const [confirming, setConfirming] = useState(false)

  if (count === 0) return null

  const actionClass = 'rounded-lg border border-subtle px-3 py-1.5 text-xs transition hover:bg-hover'

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-subtle bg-raised px-6 py-2 text-sm">
        <span className="text-muted">{count} selected</span>

        <button type="button" className={actionClass} onClick={selectAllVisible}>
          Select all
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

        <select
          defaultValue=""
          onChange={(event) => {
            if (event.target.value.length > 0) {
              void bulkUpdate({ label: event.target.value })
              event.target.value = ''
            }
          }}
          className="rounded-lg border border-subtle bg-raised px-2 py-1.5 text-xs outline-none focus:border-accent"
        >
          <option value="">Move to label…</option>
          {labels.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-xs text-accent transition hover:opacity-80"
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
