import { describePendingFailures } from '@shared/lib/pending-summary'
import { useAuthStore } from '../store/auth-store'
import { useLinksStore } from '../store/links-store'

export default function SyncBanner() {
  const authStatus = useAuthStore((state) => state.status)
  const pending = useLinksStore((state) => state.pending)
  const realtimeStatus = useLinksStore((state) => state.realtimeStatus)
  const retryPending = useLinksStore((state) => state.retryPending)

  if (authStatus !== 'authenticated') return null

  const failedItems = pending.filter((item) => item.status === 'failed')
  if (failedItems.length > 0) {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 border-b border-danger/30 bg-danger/10 px-4 py-1.5 text-xs text-danger"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden="true" />
        <span>Sync paused — {describePendingFailures(failedItems)} could not be saved.</span>
        <button
          type="button"
          onClick={() => void retryPending()}
          className="ml-auto rounded-md border border-danger/40 px-2 py-0.5 font-medium transition hover:bg-danger/10"
        >
          Retry all
        </button>
      </div>
    )
  }

  const disconnected =
    realtimeStatus === 'CHANNEL_ERROR' ||
    realtimeStatus === 'TIMED_OUT' ||
    realtimeStatus === 'CLOSED'
  if (!disconnected) return null

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs text-amber-500"
    >
      <span
        className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400"
        aria-hidden="true"
      />
      <span>Live sync reconnecting…</span>
    </div>
  )
}
