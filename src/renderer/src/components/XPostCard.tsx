import { useState } from 'react'
import { formatRelativeTime, formatShortDate } from '@shared/lib/format'
import type { XCaptureStatus, XPost } from '@shared/contract/ipc'
import ConfirmDialog from './ConfirmDialog'
import CardMenu from './CardMenu'
import XCaptureViewer from './XCaptureViewer'
import { copyText } from '../lib/copy-text'
import { openExternal } from '../lib/open-external'
import { useUiStore } from '../store/ui-store'
import { useXStore } from '../store/x-store'

const STATUS_LABEL: Record<XCaptureStatus, string> = {
  none: 'No capture yet',
  pending: 'Queued locally',
  ok: 'Captured',
  failed: 'Capture failed'
}

const actionClass =
  'rounded-md border border-subtle bg-raised px-2 py-1 text-xs text-muted transition hover:border-strong hover:text-primary'

export default function XPostCard({ post }: { post: XPost }) {
  const open = useXStore((state) => state.open)
  const retryCapture = useXStore((state) => state.retryCapture)
  const retryPending = useXStore((state) => state.retryPending)
  const discardPending = useXStore((state) => state.discardPending)
  const revealCapture = useXStore((state) => state.revealCapture)
  const openCapture = useXStore((state) => state.openCapture)
  const getCapturePreview = useXStore((state) => state.getCapturePreview)
  const removePost = useXStore((state) => state.removePost)
  const toggleRead = useXStore((state) => state.toggleRead)
  const toggleArchived = useXStore((state) => state.toggleArchived)
  const selectedIds = useXStore((state) => state.selectedIds)
  const toggleSelection = useXStore((state) => state.toggleSelection)
  const selectRange = useXStore((state) => state.selectRange)
  const openReader = useUiStore((state) => state.openReader)

  const [viewer, setViewer] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [recapturing, setRecapturing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const linkId = post.linkId
  // The capture state is synced across devices but the PNG is local: a post can
  // be marked 'ok' with no file here, so actions key off the local thumbnail.
  const hasLocalCapture = Boolean(post.thumbnailUrl)
  const isBusy = post.captureStatus === 'pending'
  const failed = post.captureStatus === 'failed'
  const selected = linkId !== null && selectedIds.includes(linkId)
  const selectionMode = selectedIds.length > 0

  const runRetry = async (action: () => Promise<void>): Promise<void> => {
    setRetrying(true)
    try {
      await action()
    } finally {
      setRetrying(false)
    }
  }

  const openPreview = async (): Promise<void> => {
    if (!linkId) return
    const dataUrl = await getCapturePreview(linkId)
    if (dataUrl) setViewer(dataUrl)
  }

  return (
    <>
      <div
        className={`group edge-highlight flex flex-col rounded-lg border border-subtle bg-raised transition hover:border-strong ${
          menuOpen ? 'z-30' : ''
        }`}
      >
        <div className="relative flex h-36 w-full items-center justify-center overflow-hidden rounded-t-lg bg-hover">
          {post.thumbnailUrl ? (
            <button type="button" onClick={() => void openPreview()} className="h-full w-full">
              <img
                src={post.thumbnailUrl}
                alt={post.authorName ? `Post by ${post.authorName}` : 'X post capture'}
                loading="lazy"
                className="h-full w-full object-cover object-top transition duration-300 hover:scale-[1.02]"
              />
            </button>
          ) : (
            <span className="px-3 text-center text-xs text-muted">
              {post.captureStatus === 'failed'
                ? 'Capture failed'
                : isBusy
                  ? 'Capturing…'
                  : 'No capture on this device'}
            </span>
          )}
          {!post.isRead ? (
            <span
              role="img"
              aria-label="Unread"
              title="Unread"
              className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-black/40"
            />
          ) : null}
          {post.isArchived ? (
            <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur">
              Archived
            </span>
          ) : null}
          {linkId ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={(event) => {
                if ((event.nativeEvent as MouseEvent).shiftKey) selectRange(linkId)
                else toggleSelection(linkId)
              }}
              aria-label={`Select ${post.authorName ?? post.url}`}
              className={`absolute bottom-2 right-2 h-3.5 w-3.5 cursor-pointer rounded accent-[var(--accent)] transition ${
                selectionMode || selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            />
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-2.5">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className="truncate text-primary">{post.authorName ?? 'X post'}</span>
            {post.authorHandle ? <span className="shrink-0">@{post.authorHandle}</span> : null}
            {post.postedAt ? (
              <span className="shrink-0 text-muted/70" title="Posted">
                · {formatShortDate(post.postedAt)}
              </span>
            ) : null}
            {post.savedAt ? (
              <span className="ml-auto shrink-0" title={`Saved ${formatShortDate(post.savedAt)}`}>
                {formatRelativeTime(post.savedAt)}
              </span>
            ) : null}
          </div>

          <p className="line-clamp-4 min-h-[1rem] text-xs leading-relaxed text-primary">
            {post.text ?? post.url}
          </p>

          {post.relatedUrl ? (
            <button
              type="button"
              onClick={() =>
                post.relatedLinkId
                  ? openReader(post.relatedLinkId)
                  : void openExternal(post.relatedUrl as string)
              }
              title={post.relatedUrl}
              className="truncate rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-left text-xs text-accent transition hover:bg-accent/15"
            >
              {post.relatedLinkId ? 'Saved link → ' : 'Contains link → '}
              {post.relatedTitle ?? post.relatedUrl}
            </button>
          ) : null}

          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
            <span
              className={`mr-auto text-xs ${failed && !hasLocalCapture ? 'text-danger' : 'text-muted'}`}
            >
              {hasLocalCapture ? STATUS_LABEL.ok : STATUS_LABEL[post.captureStatus]}
            </span>

            <button type="button" className={actionClass} onClick={() => open(post)}>
              Open on X
            </button>

            {linkId ? (
              <>
                <button
                  type="button"
                  className={actionClass}
                  onClick={() => void toggleRead(post)}
                >
                  {post.isRead ? 'Unread' : 'Read'}
                </button>
                <CardMenu
                  onOpenChange={setMenuOpen}
                  triggerClassName={actionClass}
                  items={[
                    { label: 'Copy link', onClick: () => void copyText(post.url) },
                    {
                      label: post.isArchived ? 'Unarchive' : 'Archive',
                      onClick: () => void toggleArchived(post)
                    },
                    ...(hasLocalCapture
                      ? [
                          { label: 'Preview capture', onClick: () => void openPreview() },
                          { label: 'Reveal file', onClick: () => void revealCapture(linkId) },
                          { label: 'Re-capture', onClick: () => setRecapturing(true) }
                        ]
                      : []),
                    { label: 'Delete', onClick: () => setConfirming(true), danger: true }
                  ]}
                />
              </>
            ) : null}

            {!hasLocalCapture && linkId && !isBusy ? (
              <button
                type="button"
                className={actionClass}
                disabled={retrying}
                onClick={() => void runRetry(() => retryCapture(linkId))}
              >
                {retrying
                  ? 'Retrying…'
                  : post.captureStatus === 'failed' || post.captureStatus === 'ok'
                    ? 'Retry'
                    : 'Capture'}
              </button>
            ) : null}

            {post.outboxId ? (
              <>
                {failed ? (
                  <button
                    type="button"
                    className={actionClass}
                    disabled={retrying}
                    onClick={() => void runRetry(() => retryPending(post.outboxId as string))}
                  >
                    {retrying ? 'Retrying…' : 'Retry'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={actionClass}
                  disabled={retrying}
                  onClick={() => void discardPending(post.outboxId as string)}
                >
                  Discard
                </button>
              </>
            ) : null}
          </div>

          {failed && post.captureError ? (
            <p className="line-clamp-2 text-xs text-muted/80" title={post.captureError}>
              {post.captureError}
            </p>
          ) : null}
        </div>
      </div>

      {viewer ? (
        <XCaptureViewer
          dataUrl={viewer}
          onClose={() => setViewer(null)}
          onOpenImage={() => {
            if (linkId) void openCapture(linkId)
          }}
        />
      ) : null}

      {confirming && linkId ? (
        <ConfirmDialog
          title="Delete post"
          message="Delete this X post? The local screenshot is removed and undo will not restore it."
          confirmLabel="Delete"
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            await removePost(post)
            setConfirming(false)
          }}
        />
      ) : null}

      {recapturing && linkId ? (
        <ConfirmDialog
          title="Re-capture"
          message="Replace the local screenshot with a fresh render of this post?"
          confirmLabel="Re-capture"
          onCancel={() => setRecapturing(false)}
          onConfirm={async () => {
            await runRetry(() => retryCapture(linkId))
            setRecapturing(false)
          }}
        />
      ) : null}
    </>
  )
}
