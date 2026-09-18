import type { PendingCapture } from '@shared/contract/ipc'
import { domainOf, formatRelativeTime } from '@shared/lib/format'
import { labelColor } from '@shared/lib/label-color'
import { useLinksStore } from '../store/links-store'

function PendingSpinner() {
  return (
    <span
      className="h-3 w-3 animate-spin rounded-full border-2 border-muted/40 border-t-accent"
      aria-hidden="true"
    />
  )
}

export default function PendingLinkCard({ pending }: { pending: PendingCapture }) {
  const retryPending = useLinksStore((state) => state.retryPending)
  const discardPending = useLinksStore((state) => state.discardPending)
  const labelColors = useLinksStore((state) => state.labelColors)

  const domain = domainOf(pending.url)
  const failed = pending.status === 'failed'

  return (
    <div className="relative flex flex-col overflow-hidden rounded-lg border border-dashed border-subtle bg-raised/60">
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
              style={{ backgroundColor: labelColor(pending.label, labelColors) }}
            />
            <span className="truncate">{pending.label}</span>
          </span>
          <span className="truncate text-xs text-muted/80">{domain}</span>
          <span className="ml-auto shrink-0 text-xs text-muted/80">
            {formatRelativeTime(pending.createdAt)}
          </span>
        </div>

        <p className="line-clamp-2 break-all text-[13px] font-medium leading-snug text-primary">
          {pending.url}
        </p>

        <div className="mt-auto flex items-center gap-2 pt-1">
          {failed ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-danger">
                <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" />
                Failed
              </span>
              <button
                type="button"
                onClick={() => void retryPending(pending.id)}
                className="ml-auto rounded-md border border-subtle bg-panel px-2 py-1 text-xs font-medium text-primary transition hover:border-strong"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => void discardPending(pending.id)}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted transition hover:text-danger"
              >
                Discard
              </button>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <PendingSpinner />
              Saving…
            </span>
          )}
        </div>

        {failed && pending.lastError ? (
          <p className="line-clamp-1 text-xs text-muted/80" title={pending.lastError.message}>
            {pending.lastError.message}
          </p>
        ) : null}
      </div>
    </div>
  )
}
