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
      className="rounded-md bg-black/55 px-1.5 py-1 text-xs font-medium text-white ring-1 ring-white/10 backdrop-blur transition hover:bg-black/80"
    >
      {label}
    </button>
  )
}

export default function LinkCard({ link }: { link: Link }) {
  const domain = domainOf(link.url)
  const updateLink = useLinksStore((state) => state.updateLink)
  const deleteLink = useLinksStore((state) => state.deleteLink)
  const labelColors = useLinksStore((state) => state.labelColors)
  const selectedIds = useLinksStore((state) => state.selectedIds)
  const conflicts = useLinksStore((state) => state.conflicts)
  const toggleSelection = useLinksStore((state) => state.toggleSelection)
  const selectRange = useLinksStore((state) => state.selectRange)
  const openLink = useLinksStore((state) => state.openLink)

  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null)

  const selectionMode = selectedIds.length > 0
  const selected = selectedIds.includes(link.id)
  const isArticle = link.extractionStatus === 'ok' && (link.wordCount ?? 0) > 0
  const isMedia = link.extractionStatus === 'media'

  const openTarget = () => {
    if (selectionMode) {
      toggleSelection(link.id)
      return
    }
    openLink(link)
  }

  return (
    <>
      <div
        className={`group relative flex flex-col overflow-hidden rounded-lg border edge-highlight transition duration-200 hover:-translate-y-px hover:border-strong hover:bg-hover ${
          selected ? 'border-accent/70 bg-hover' : 'border-subtle bg-raised'
        }`}
      >
        <button
          type="button"
          onClick={openTarget}
          title={isArticle || isMedia ? 'Open reader' : 'Open in browser'}
          className="flex flex-1 flex-col text-left"
        >
          <div className="relative h-28 w-full overflow-hidden bg-hover">
            {link.thumbnailUrl && failedThumbnail !== link.thumbnailUrl ? (
              <img
                src={link.thumbnailUrl}
                alt=""
                loading="lazy"
                onError={() => setFailedThumbnail(link.thumbnailUrl)}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-2xl text-muted/70">
                {domain.charAt(0).toUpperCase()}
              </div>
            )}
            {!link.isRead ? (
              <span
                className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-black/40"
                title="Unread"
              />
            ) : null}
            {conflicts.includes(link.id) ? (
              <span
                className="absolute bottom-2 left-2 rounded bg-amber-400/95 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-black"
                title="A change on another device conflicted with your edit; your version was kept"
              >
                Conflict
              </span>
            ) : null}
          </div>

          <div className="flex flex-1 flex-col gap-1.5 p-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                  style={{ backgroundColor: labelColor(link.label, labelColors) }}
                />
                <span className="truncate">{link.label}</span>
              </span>
              <span className="truncate text-xs text-muted/80">{domain}</span>
              {isArticle && link.readingTimeMinutes ? (
                <span className="shrink-0 rounded bg-hover px-1.5 py-0.5 text-xs text-muted ring-1 ring-inset ring-strong/40">
                  Read · {link.readingTimeMinutes} min
                </span>
              ) : isMedia ? (
                <span className="shrink-0 rounded bg-hover px-1.5 py-0.5 text-xs text-muted ring-1 ring-inset ring-strong/40">
                  Watch
                </span>
              ) : null}
              {link.matchedInContent ? (
                <span
                  className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent"
                  title="Matched in the article text"
                >
                  article
                </span>
              ) : null}
              <span className="ml-auto shrink-0 text-xs text-muted/80">
                {formatRelativeTime(link.createdAt)}
              </span>
            </div>

            <p className="line-clamp-2 text-[13px] font-medium leading-snug text-primary">
              {link.title ?? domain}
            </p>

            {link.description ? (
              <p className="line-clamp-2 text-xs leading-relaxed text-muted">
                {link.description}
              </p>
            ) : null}
          </div>
        </button>

        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => {
            if ((event.nativeEvent as MouseEvent).shiftKey) selectRange(link.id)
            else toggleSelection(link.id)
          }}
          aria-label={`Select ${link.title ?? link.url}`}
          className={`absolute left-2 top-2 h-3.5 w-3.5 cursor-pointer rounded accent-[var(--accent)] transition ${
            selectionMode || selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        />

        {!selectionMode ? (
          <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
            {isArticle || isMedia ? (
              <ActionButton
                label="Original"
                onClick={() => void api.system.openExternal(link.url)}
              />
            ) : null}
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
