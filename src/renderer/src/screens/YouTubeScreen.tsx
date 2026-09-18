import { useEffect, useState } from 'react'
import type { LinkFilter, LinkSort } from '@shared/contract/ipc'
import { classifyLinkKind } from '@shared/lib/link-url'
import { sectionListState } from '@shared/lib/section-state'
import EmptyState from '../components/EmptyState'
import PendingLinkCard from '../components/PendingLinkCard'
import SectionBulkBar from '../components/SectionBulkBar'
import { UndoToastView } from '../components/UndoToast'
import YouTubeCard from '../components/YouTubeCard'
import { secondaryButtonClass } from '../components/ui-classes'
import { api } from '../lib/api'
import { useEscapeToLibrary } from '../lib/use-escape-to-library'
import { useLinksStore } from '../store/links-store'
import { useUiStore } from '../store/ui-store'
import { useYouTubeStore } from '../store/youtube-store'

const FILTERS: Array<{ value: LinkFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unwatched' },
  { value: 'archived', label: 'Archived' }
]

const SORTS: Array<{ value: LinkSort; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'title', label: 'Title' }
]

export default function YouTubeScreen() {
  const items = useYouTubeStore((state) => state.items)
  const filter = useYouTubeStore((state) => state.filter)
  const search = useYouTubeStore((state) => state.search)
  const sort = useYouTubeStore((state) => state.sort)
  const status = useYouTubeStore((state) => state.status)
  const error = useYouTubeStore((state) => state.error)
  const hasMore = useYouTubeStore((state) => state.hasMore)
  const loadingMore = useYouTubeStore((state) => state.loadingMore)
  const loadMoreError = useYouTubeStore((state) => state.loadMoreError)
  const selectedIds = useYouTubeStore((state) => state.selectedIds)
  const lastDeleted = useYouTubeStore((state) => state.lastDeleted)
  const undoExpiresAt = useYouTubeStore((state) => state.undoExpiresAt)
  const load = useYouTubeStore((state) => state.load)
  const loadMore = useYouTubeStore((state) => state.loadMore)
  const setFilter = useYouTubeStore((state) => state.setFilter)
  const setSearch = useYouTubeStore((state) => state.setSearch)
  const setSort = useYouTubeStore((state) => state.setSort)
  const clearQuery = useYouTubeStore((state) => state.clearQuery)
  const clearSelection = useYouTubeStore((state) => state.clearSelection)
  const bulkRead = useYouTubeStore((state) => state.bulkRead)
  const bulkArchive = useYouTubeStore((state) => state.bulkArchive)
  const bulkDelete = useYouTubeStore((state) => state.bulkDelete)
  const markAllWatched = useYouTubeStore((state) => state.markAllWatched)
  const undoRemove = useYouTubeStore((state) => state.undoRemove)
  const dismissUndo = useYouTubeStore((state) => state.dismissUndo)
  const pending = useLinksStore((state) => state.pending)
  const total = useLinksStore((state) => state.stats.youtube)
  const setView = useUiStore((state) => state.setView)
  const [text, setText] = useState(search)

  useEscapeToLibrary()

  // The undo window and selection are section-scoped: leaving clears them.
  useEffect(
    () => () => {
      useYouTubeStore.getState().dismissUndo()
      useYouTubeStore.getState().clearSelection()
    },
    []
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      if (text !== search) void setSearch(text)
    }, 300)
    return () => clearTimeout(timer)
  }, [text, search, setSearch])

  // Queued captures are never archived, so they are hidden under that filter.
  // They also have no text/author to match, so an active search hides them.
  const pendingVideos =
    filter === 'archived' || search.trim().length > 0
      ? []
      : pending.filter((item) => classifyLinkKind(item.url) === 'youtube')
  const hasQueryFilter = search.trim().length > 0 || filter !== 'all'
  const listState = sectionListState({
    status,
    hasError: error !== null,
    itemCount: items.length,
    pendingCount: pendingVideos.length
  })
  const loading = status === 'loading'

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return api.links.onChanged(() => {
      void load()
    })
  }, [load])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface text-primary">
      <header className="flex items-center gap-3 border-b border-subtle px-4 py-2.5">
        <button
          type="button"
          onClick={() => setView('library')}
          className="text-xs text-muted transition hover:text-primary"
        >
          ← Library
        </button>
        <span className="h-3 w-px bg-subtle" />
        <h1 className="font-display text-sm font-semibold tracking-tight">YouTube</h1>
        <span className="font-mono text-xs text-muted">{total}</span>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-busy={loading}
          className="text-xs text-muted transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>

        <span className="ml-auto text-xs text-muted">Videos open on YouTube</span>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-4 py-1.5 text-xs">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search videos"
          aria-label="Search videos"
          className="w-44 rounded-md border border-subtle bg-raised px-2.5 py-1 text-xs outline-none transition placeholder:text-muted focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
        />

        <div className="flex items-center gap-0.5 rounded-md border border-subtle p-0.5">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => void setFilter(option.value)}
              className={`rounded px-2 py-0.5 text-xs transition ${
                filter === option.value
                  ? 'bg-hover text-primary'
                  : 'text-muted hover:text-primary'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-muted">
          <span className="text-xs">Sort</span>
          <select
            value={sort}
            onChange={(event) => void setSort(event.target.value as LinkSort)}
            className="rounded-md border border-subtle bg-raised px-2 py-1 text-xs text-primary outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {filter !== 'archived' ? (
          <button
            type="button"
            onClick={() => void markAllWatched()}
            disabled={loading}
            className="text-xs text-muted transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mark all watched
          </button>
        ) : null}

        {hasQueryFilter ? (
          <button
            type="button"
            onClick={() => {
              setText('')
              void clearQuery()
            }}
            className="text-xs text-accent transition hover:brightness-125"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto p-4"
        onScroll={(event) => {
          const element = event.currentTarget
          if (element.scrollHeight - element.scrollTop - element.clientHeight < 400) {
            void loadMore()
          }
        }}
      >
        {error ? (
          <div
            role="alert"
            className="mb-3 flex items-center gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            <span className="min-w-0 flex-1">{error}</span>
            <button
              type="button"
              onClick={() => void load()}
              className="shrink-0 rounded-md border border-danger/40 px-2 py-0.5 font-medium transition hover:bg-danger/10"
            >
              Retry
            </button>
          </div>
        ) : null}

        <SectionBulkBar count={selectedIds.length} onClear={clearSelection}>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => void bulkRead()}
          >
            Mark watched
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => void bulkArchive()}
          >
            Archive
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => void bulkDelete()}
          >
            Delete
          </button>
        </SectionBulkBar>

        {listState === 'loading' ? (
          <p className="text-xs text-muted" aria-live="polite">
            Loading videos…
          </p>
        ) : listState === 'error' ? null : listState === 'empty' ? (
          search.trim() ? (
            <EmptyState
              title="No matching videos"
              description="Nothing matches the current search."
              action={
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => {
                    setText('')
                    void clearQuery()
                  }}
                >
                  Clear filters
                </button>
              }
            />
          ) : filter === 'unread' ? (
            <EmptyState
              title="Nothing unwatched"
              description="Every video in this section is marked watched."
              action={
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => void setFilter('all')}
                >
                  Show all
                </button>
              }
            />
          ) : filter === 'archived' ? (
            <EmptyState
              title="No archived videos"
              description="Archive a video to keep it out of the way without deleting it."
              action={
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => void setFilter('all')}
                >
                  Show all
                </button>
              }
            />
          ) : (
            <EmptyState
              title="No YouTube videos yet"
              description="Copy a link to a YouTube video and Linkster files it here instead of the main library."
            />
          )
        ) : (
          <>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
              {pendingVideos.map((item) => (
                <PendingLinkCard key={item.id} pending={item} />
              ))}
              {items.map((video) => (
                <YouTubeCard key={video.id} video={video} />
              ))}
            </div>
            {loadingMore ? (
              <p className="py-3 text-center text-xs text-muted" aria-live="polite">
                Loading more…
              </p>
            ) : loadMoreError ? (
              <div className="flex items-center justify-center gap-2 py-3 text-xs">
                <span className="text-danger">{loadMoreError}</span>
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  className="rounded-md border border-danger/40 px-2 py-0.5 font-medium text-danger transition hover:bg-danger/10"
                >
                  Retry
                </button>
              </div>
            ) : hasMore ? (
              <p className="py-3 text-center text-xs text-muted">Scroll for more</p>
            ) : null}
          </>
        )}
      </div>

      <UndoToastView
        itemCount={lastDeleted.length}
        expiresAt={undoExpiresAt}
        onUndo={() => void undoRemove()}
        onDismiss={dismissUndo}
        noun="Video"
      />
    </div>
  )
}
