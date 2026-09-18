import { useEffect, useState } from 'react'
import type { XPostFilter, XPostSort } from '@shared/contract/ipc'
import { sectionListState } from '@shared/lib/section-state'
import AddLinkDialog from '../components/AddLinkDialog'
import EmptyState from '../components/EmptyState'
import SectionBulkBar from '../components/SectionBulkBar'
import { UndoToastView } from '../components/UndoToast'
import XPostCard from '../components/XPostCard'
import { secondaryButtonClass } from '../components/ui-classes'
import { api } from '../lib/api'
import { useEscapeToLibrary } from '../lib/use-escape-to-library'
import { useAuthStore } from '../store/auth-store'
import { useLinksStore } from '../store/links-store'
import { useUiStore } from '../store/ui-store'
import { useXStore } from '../store/x-store'

const X_FILTERS: Array<{ value: XPostFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'archived', label: 'Archived' },
  { value: 'has-link', label: 'Has link' },
  { value: 'failed', label: 'Failed' }
]

const X_SORTS: Array<{ value: XPostSort; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'author', label: 'Author' }
]

export default function XScreen() {
  const items = useXStore((state) => state.items)
  const total = useLinksStore((state) => state.stats.xPosts)
  const status = useXStore((state) => state.status)
  const error = useXStore((state) => state.error)
  const hasMore = useXStore((state) => state.hasMore)
  const loadingMore = useXStore((state) => state.loadingMore)
  const loadMoreError = useXStore((state) => state.loadMoreError)
  const search = useXStore((state) => state.search)
  const filter = useXStore((state) => state.filter)
  const sort = useXStore((state) => state.sort)
  const selectedIds = useXStore((state) => state.selectedIds)
  const lastDeleted = useXStore((state) => state.lastDeleted)
  const undoExpiresAt = useXStore((state) => state.undoExpiresAt)
  const load = useXStore((state) => state.load)
  const loadMore = useXStore((state) => state.loadMore)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const setSearch = useXStore((state) => state.setSearch)
  const setFilter = useXStore((state) => state.setFilter)
  const setSort = useXStore((state) => state.setSort)
  const clearQuery = useXStore((state) => state.clearQuery)
  const clearSelection = useXStore((state) => state.clearSelection)
  const bulkRead = useXStore((state) => state.bulkRead)
  const bulkArchive = useXStore((state) => state.bulkArchive)
  const bulkDelete = useXStore((state) => state.bulkDelete)
  const undoRemove = useXStore((state) => state.undoRemove)
  const dismissUndo = useXStore((state) => state.dismissUndo)
  const setView = useUiStore((state) => state.setView)
  const [addOpen, setAddOpen] = useState(false)
  const [text, setText] = useState(search)

  useEscapeToLibrary()

  // The undo window and selection are section-scoped: leaving clears them.
  useEffect(
    () => () => {
      useXStore.getState().dismissUndo()
      useXStore.getState().clearSelection()
    },
    []
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      if (text !== search) void setSearch(text)
    }, 300)
    return () => clearTimeout(timer)
  }, [text, search, setSearch])

  // Queued captures live in the outbox until persisted; reload when they
  // change so copied X links appear (and vanish) without a manual refresh.
  const queuedCount = items.filter((post) => post.outboxId !== null).length
  const hasQueryFilter = search.trim().length > 0 || filter !== 'all'
  const listState = sectionListState({
    status,
    hasError: error !== null,
    itemCount: items.length,
    pendingCount: queuedCount
  })
  const loading = status === 'loading'

  useEffect(() => {
    void load()
  }, [load, userId])

  useEffect(() => {
    return api.links.onPendingChanged(() => {
      void load()
    })
  }, [load])

  useEffect(() => {
    return api.x.onChanged(() => {
      void load()
    })
  }, [load])

  // Remote inserts/deletes/edits of X post links arrive as link changes.
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
        <h1 className="font-display text-sm font-semibold tracking-tight">X Posts</h1>
        <span className="font-mono text-xs text-muted">{total}</span>
        {queuedCount > 0 ? (
          <span
            className="rounded-full border border-subtle px-1.5 py-0.5 text-xs text-muted"
            title="Queued captures are included in the section total"
          >
            {queuedCount} queued
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-busy={loading}
          className="text-xs text-muted transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>

        <span className="ml-auto text-xs text-muted">Captures are stored locally</span>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-4 py-1.5 text-xs">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search X posts"
          aria-label="Search X posts"
          className="w-44 rounded-md border border-subtle bg-raised px-2.5 py-1 text-xs outline-none transition placeholder:text-muted focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
        />

        <div className="flex items-center gap-0.5 rounded-md border border-subtle p-0.5">
          {X_FILTERS.map((option) => (
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
            onChange={(event) => void setSort(event.target.value as XPostSort)}
            className="rounded-md border border-subtle bg-raised px-2 py-1 text-xs text-primary outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
          >
            {X_SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

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
            Mark read
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
            Loading X posts…
          </p>
        ) : listState === 'error' ? null : listState === 'empty' ? (
          hasQueryFilter ? (
            <EmptyState
              title="No matching posts"
              description="Nothing matches the current search or filters."
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
          ) : (
            <EmptyState
              title="No X posts yet"
              description="Copy a link to an X post and Linkster files it here with a local screenshot and any link it contains."
              action={
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => setAddOpen(true)}
                >
                  Add link
                </button>
              }
            />
          )
        ) : (
          <>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
              {items.map((post) => (
                <XPostCard key={post.linkId ?? post.outboxId ?? post.url} post={post} />
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

      {addOpen ? (
        <AddLinkDialog
          onClose={() => {
            setAddOpen(false)
            void load()
          }}
        />
      ) : null}

      <UndoToastView
        itemCount={lastDeleted.length}
        expiresAt={undoExpiresAt}
        onUndo={() => void undoRemove()}
        onDismiss={dismissUndo}
        noun="Post"
      />
    </div>
  )
}
