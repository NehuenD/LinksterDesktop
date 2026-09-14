import { useState } from 'react'
import type { Link } from '@shared/contract/ipc'
import { domainOf, formatRelativeTime } from '@shared/lib/format'
import { labelColor } from '@shared/lib/label-color'
import { api } from '../lib/api'
import { useLinksStore } from '../store/links-store'
import ConfirmDialog from './ConfirmDialog'
import EditLinkDialog from './EditLinkDialog'

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-white backdrop-blur transition hover:bg-black/90"
    >
      {label}
    </button>
  )
}

export default function LinkCard({ link }: { link: Link }) {
  const domain = domainOf(link.url)
  const updateLink = useLinksStore((state) => state.updateLink)
  const deleteLink = useLinksStore((state) => state.deleteLink)
  const selectedIds = useLinksStore((state) => state.selectedIds)
  const toggleSelection = useLinksStore((state) => state.toggleSelection)

  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const selectionMode = selectedIds.length > 0
  const selected = selectedIds.includes(link.id)

  return (
    <>
      <div
        className={`group relative flex flex-col overflow-hidden rounded-xl border bg-raised transition hover:-translate-y-0.5 hover:bg-hover ${
          selected ? 'border-accent' : 'border-subtle'
        }`}
      >
        <button
          type="button"
          onClick={() =>
            selectionMode ? toggleSelection(link.id) : void api.system.openExternal(link.url)
          }
          className="flex flex-1 flex-col text-left"
        >
          <div className="relative h-32 w-full overflow-hidden bg-hover">
            {link.thumbnailUrl ? (
              <img
                src={link.thumbnailUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-3xl text-muted">
                {domain.charAt(0).toUpperCase()}
              </div>
            )}
            {!link.isRead ? (
              <span
                className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent"
                title="Unread"
              />
            ) : null}
          </div>

          <div className="flex flex-1 flex-col gap-2 p-4">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                style={{ backgroundColor: labelColor(link.label) }}
              >
                {link.label}
              </span>
              <span className="truncate text-xs text-muted">{domain}</span>
              <span className="ml-auto shrink-0 text-xs text-muted">
                {formatRelativeTime(link.createdAt)}
              </span>
            </div>

            <p className="line-clamp-2 font-medium text-primary">{link.title ?? domain}</p>

            {link.description ? (
              <p className="line-clamp-2 text-sm text-muted">{link.description}</p>
            ) : null}
          </div>
        </button>

        <input
          type="checkbox"
          checked={selected}
          onChange={() => toggleSelection(link.id)}
          aria-label={`Select ${link.title ?? link.url}`}
          className={`absolute left-2 top-2 h-4 w-4 cursor-pointer accent-[var(--accent)] transition ${
            selectionMode || selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        />

        {!selectionMode ? (
          <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
            <ActionButton label="Edit" onClick={() => setEditing(true)} />
            <ActionButton
              label={link.isRead ? 'Unread' : 'Read'}
              onClick={() => void updateLink(link.id, { isRead: !link.isRead })}
            />
            <ActionButton
              label={link.isArchived ? 'Unarchive' : 'Archive'}
              onClick={() => void updateLink(link.id, { isArchived: !link.isArchived })}
            />
            <ActionButton label="Delete" onClick={() => setConfirming(true)} />
          </div>
        ) : null}
      </div>

      {editing ? <EditLinkDialog link={link} onClose={() => setEditing(false)} /> : null}

      {confirming ? (
        <ConfirmDialog
          title="Delete link"
          message="This permanently deletes the link. You can undo immediately after."
          confirmLabel="Delete"
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            await deleteLink(link.id)
            setConfirming(false)
          }}
        />
      ) : null}
    </>
  )
}
