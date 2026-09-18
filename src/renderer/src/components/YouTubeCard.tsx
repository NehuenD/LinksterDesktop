import { useState } from 'react'
import { DEFAULT_LABEL, type Link } from '@shared/contract/ipc'
import { domainOf, formatDuration, formatRelativeTime } from '@shared/lib/format'
import { parseYouTubeVideoUrl, youtubeThumbnailSources } from '@shared/lib/youtube-url'
import { copyText } from '../lib/copy-text'
import { useYouTubeStore } from '../store/youtube-store'
import CardMenu from './CardMenu'
import ConfirmDialog from './ConfirmDialog'

const ORIGIN_LABEL: Record<string, string> = {
  shorts: 'Shorts',
  live: 'Live',
  music: 'Music'
}

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

export default function YouTubeCard({ video }: { video: Link }) {
  const open = useYouTubeStore((state) => state.open)
  const refresh = useYouTubeStore((state) => state.refresh)
  const toggleRead = useYouTubeStore((state) => state.toggleRead)
  const toggleArchived = useYouTubeStore((state) => state.toggleArchived)
  const remove = useYouTubeStore((state) => state.remove)
  const selectedIds = useYouTubeStore((state) => state.selectedIds)
  const toggleSelection = useYouTubeStore((state) => state.toggleSelection)
  const selectRange = useYouTubeStore((state) => state.selectRange)
  const [confirming, setConfirming] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sourceIndex, setSourceIndex] = useState(0)
  const [posterLoaded, setPosterLoaded] = useState(false)

  const selected = selectedIds.includes(video.id)
  const selectionMode = selectedIds.length > 0

  const videoId = parseYouTubeVideoUrl(video.url)?.videoId ?? null
  // og:image URLs for YouTube can be signed and expire; walk the id-derived
  // quality ladder (maxres → hq → mq) when a source fails.
  const sources = youtubeThumbnailSources(videoId, video.thumbnailUrl)
  const thumbnail = sources[sourceIndex] ?? null

  const domain = domainOf(video.url)
  const duration = formatDuration(video.durationSeconds)
  const originLabel = video.origin ? ORIGIN_LABEL[video.origin] : undefined
  const showLabel = video.label !== DEFAULT_LABEL

  return (
    <>
      <div
        className={`group relative flex flex-col rounded-lg border edge-highlight border-subtle bg-raised transition duration-200 hover:-translate-y-px hover:border-strong hover:bg-hover ${
          menuOpen ? 'z-30' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => open(video)}
          title="Watch on YouTube"
          className="flex flex-1 flex-col text-left"
        >
          <div className="relative aspect-video w-full overflow-hidden rounded-t-lg bg-hover">
            {thumbnail ? (
              <>
                {!posterLoaded ? (
                  <div className="absolute inset-0 animate-pulse bg-hover" aria-hidden="true" />
                ) : null}
                <img
                  src={thumbnail}
                  alt=""
                  loading="lazy"
                  onLoad={() => setPosterLoaded(true)}
                  onError={() => {
                    setPosterLoaded(false)
                    setSourceIndex((index) => index + 1)
                  }}
                  className={`h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] ${
                    posterLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-2xl text-muted/70">
                ▶
              </div>
            )}
            <div className="absolute left-2 top-2 flex items-center gap-1.5">
              {!video.isRead ? (
                <span
                  role="img"
                  aria-label="Unwatched"
                  title="Unwatched"
                  className="h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-black/40"
                />
              ) : null}
              {originLabel ? (
                <span className="rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur">
                  {originLabel}
                </span>
              ) : null}
            </div>
            {duration ? (
              <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-xs font-medium text-white">
                {duration}
              </span>
            ) : null}
            {video.isArchived ? (
              <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur">
                Archived
              </span>
            ) : null}
          </div>

          <div className="flex flex-1 flex-col gap-1.5 p-3">
            <p className="line-clamp-2 text-[13px] font-medium leading-snug text-primary">
              {video.title ?? domain}
            </p>
            {video.description ? (
              <p className="line-clamp-2 text-xs leading-relaxed text-muted">
                {video.description}
              </p>
            ) : null}
            <div className="mt-auto flex items-center gap-2 text-xs text-muted">
              {showLabel ? (
                <span className="shrink-0 rounded border border-subtle px-1.5 py-0.5 text-xs">
                  {video.label}
                </span>
              ) : null}
              <span className="truncate">{video.author ?? video.siteName ?? domain}</span>
              <span className="ml-auto shrink-0">{formatRelativeTime(video.createdAt)}</span>
            </div>
          </div>
        </button>

        <div
          className={`absolute right-1.5 top-1.5 flex items-center gap-1 ${
            selectionMode || menuOpen
              ? 'opacity-100'
              : 'opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => {
              if ((event.nativeEvent as MouseEvent).shiftKey) selectRange(video.id)
              else toggleSelection(video.id)
            }}
            aria-label={`Select ${video.title ?? video.url}`}
            className={`h-3.5 w-3.5 cursor-pointer rounded accent-[var(--accent)] transition ${
              selected ? 'opacity-100' : ''
            }`}
          />
          {!selectionMode ? (
            <>
              <ActionButton
                label={video.isRead ? 'Unwatched' : 'Watched'}
                onClick={() => void toggleRead(video)}
              />
              <CardMenu
                onOpenChange={setMenuOpen}
                triggerClassName="rounded-md bg-black/55 px-2 py-1 text-xs font-medium leading-none text-white ring-1 ring-white/10 backdrop-blur transition hover:bg-black/80"
                items={[
                  {
                    label: video.isArchived ? 'Unarchive' : 'Archive',
                    onClick: () => void toggleArchived(video)
                  },
                  { label: 'Copy link', onClick: () => void copyText(video.url) },
                  { label: 'Refresh metadata', onClick: () => void refresh(video) },
                  { label: 'Delete', onClick: () => setConfirming(true), danger: true }
                ]}
              />
            </>
          ) : null}
        </div>
      </div>

      {confirming ? (
        <ConfirmDialog
          title="Delete video"
          message="Delete this video from your saved links? The undo bar can bring it back for a few seconds."
          confirmLabel="Delete"
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            await remove(video)
            setConfirming(false)
          }}
        />
      ) : null}
    </>
  )
}
