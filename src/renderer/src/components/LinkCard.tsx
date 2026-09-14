import type { Link } from '@shared/contract/ipc'
import { domainOf, formatRelativeTime } from '@shared/lib/format'
import { labelColor } from '@shared/lib/label-color'
import { api } from '../lib/api'

export default function LinkCard({ link }: { link: Link }) {
  const domain = domainOf(link.url)

  return (
    <button
      type="button"
      onClick={() => void api.system.openExternal(link.url)}
      className="group flex flex-col overflow-hidden rounded-xl border border-subtle bg-raised text-left transition hover:-translate-y-0.5 hover:bg-hover"
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
  )
}
