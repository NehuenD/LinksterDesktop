import { useEffect, useState } from 'react'
import { formatShortcutHint } from '@shared/lib/hotkey'
import { classifyLinkKind } from '@shared/lib/link-url'
import AddLinkDialog from '../components/AddLinkDialog'
import BulkActionBar from '../components/BulkActionBar'
import CommandPalette from '../components/CommandPalette'
import EmptyState from '../components/EmptyState'
import FilterBar from '../components/FilterBar'
import LinkCard from '../components/LinkCard'
import PendingLinkCard from '../components/PendingLinkCard'
import Sidebar from '../components/Sidebar'
import UndoToast from '../components/UndoToast'
import { secondaryButtonClass } from '../components/ui-classes'
import { api } from '../lib/api'
import { useGlobalShortcuts } from '../lib/use-global-shortcuts'
import { useClipboardStore } from '../store/clipboard-store'
import { useAuthStore } from '../store/auth-store'
import { useLinksStore } from '../store/links-store'
import { useUiStore } from '../store/ui-store'
import ScreenshotsScreen from './ScreenshotsScreen'
import SettingsScreen from './SettingsScreen'
import XScreen from './XScreen'
import YouTubeScreen from './YouTubeScreen'

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5">
      <circle
        cx="11"
        cy="11"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="m20 20-3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function HomeScreen() {
  const load = useLinksStore((state) => state.load)
  const loadMore = useLinksStore((state) => state.loadMore)
  const links = useLinksStore((state) => state.links)
  const pending = useLinksStore((state) => state.pending)
  const filter = useLinksStore((state) => state.filter)
  const selectedLabel = useLinksStore((state) => state.selectedLabel)
  const domain = useLinksStore((state) => state.domain)
  const dateFrom = useLinksStore((state) => state.dateFrom)
  const dateTo = useLinksStore((state) => state.dateTo)
  const status = useLinksStore((state) => state.status)
  const error = useLinksStore((state) => state.error)
  const hasMore = useLinksStore((state) => state.hasMore)
  const loadingMore = useLinksStore((state) => state.loadingMore)
  const search = useLinksStore((state) => state.search)
  const setSearch = useLinksStore((state) => state.setSearch)
  const searchContent = useLinksStore((state) => state.searchContent)
  const setSearchContent = useLinksStore((state) => state.setSearchContent)
  const markAllRead = useLinksStore((state) => state.markAllRead)
  const clearFilters = useLinksStore((state) => state.clearFilters)
  const monitoring = useClipboardStore((state) => state.monitoring)
  const loadClipboard = useClipboardStore((state) => state.load)
  const setMonitoring = useClipboardStore((state) => state.setMonitoring)
  const view = useUiStore((state) => state.view)
  const platform = useUiStore((state) => state.platform)
  const paletteOpen = useUiStore((state) => state.paletteOpen)
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen)
  const addDialogOpen = useUiStore((state) => state.addDialogOpen)
  const setAddDialogOpen = useUiStore((state) => state.setAddDialogOpen)
  const userId = useAuthStore((state) => state.user?.id ?? null)

  const [text, setText] = useState(search)

  useGlobalShortcuts({
    onOpenPalette: () => setPaletteOpen(true),
    onAddLink: () => setAddDialogOpen(true),
    enabled: view === 'library'
  })

  useEffect(() => {
    // userId is a dependency so an account switch (which resets the stores)
    // refetches immediately instead of leaving the library empty.
    void load()
    void loadClipboard()
  }, [load, loadClipboard, userId])

  useEffect(() => {
    return api.links.onChanged(() => {
      void useLinksStore.getState().load()
    })
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (text !== search) void setSearch(text)
    }, 300)
    return () => clearTimeout(timer)
  }, [text, search, setSearch])

  const showPending =
    filter === 'all' &&
    selectedLabel === null &&
    domain.trim() === '' &&
    dateFrom === null &&
    dateTo === null &&
    search.trim() === ''
  // X posts and YouTube videos are isolated in their own sections, so their
  // queued captures must not leak into the library's pending strip.
  const visiblePending = showPending
    ? pending.filter((item) => classifyLinkKind(item.url) === 'link')
    : []

  const hasFilters =
    filter !== 'all' ||
    selectedLabel !== null ||
    domain.trim().length > 0 ||
    dateFrom !== null ||
    dateTo !== null ||
    search.trim().length > 0

  if (view === 'settings') {
    return <SettingsScreen />
  }

  if (view === 'screenshots') {
    return <ScreenshotsScreen />
  }

  if (view === 'x') {
    return <XScreen />
  }

  if (view === 'youtube') {
    return <YouTubeScreen />
  }

  return (
    <div className="flex h-full overflow-hidden bg-surface text-primary">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-subtle px-4 py-2.5">
          <div className="relative w-full max-w-xs">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
              <SearchIcon />
            </span>
            <input
              id="linkster-search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Search links and articles…"
              className="w-full rounded-md border border-subtle bg-raised py-1.5 pl-8 pr-14 text-xs text-primary outline-none transition placeholder:text-muted focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
            />
            <kbd className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded border border-subtle bg-panel px-1.5 py-0.5 font-mono text-xs leading-none text-muted">
              /
            </kbd>
          </div>

          <button
            type="button"
            onClick={() => void setSearchContent(!searchContent)}
            title="Include article text in search results"
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition hover:border-strong hover:text-primary ${
              searchContent ? 'border-accent/50 bg-accent/10 text-primary' : 'border-subtle bg-raised text-muted'
            }`}
          >
            Full text
          </button>

          <button
            type="button"
            onClick={() => void markAllRead()}
            className="rounded-md border border-subtle bg-raised px-2 py-1.5 text-xs text-muted transition hover:border-strong hover:text-primary"
            title="Mark every unread link matching the current filters as read"
          >
            Mark all read
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-subtle bg-raised px-2 py-1.5 text-xs text-muted transition hover:border-strong hover:text-primary"
            title="Command palette"
          >
            Commands
            <kbd className="rounded border border-subtle bg-panel px-1 font-mono text-xs leading-none text-muted">
              {formatShortcutHint(platform, 'K')}
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => void setMonitoring(!monitoring)}
            aria-pressed={monitoring}
            className="flex items-center gap-1.5 rounded-md border border-subtle bg-raised px-2 py-1.5 text-xs text-muted transition hover:border-strong hover:text-primary"
            title="Automatically save URLs copied to the clipboard"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                monitoring ? 'animate-pulse bg-emerald-400' : 'bg-muted'
              }`}
            />
            {monitoring ? 'Auto-capture on' : 'Auto-capture off'}
          </button>

          <button
            type="button"
            onClick={() => setAddDialogOpen(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg transition hover:brightness-110 active:scale-[0.98]"
          >
            <span className="text-sm leading-none">+</span>
            Add link
          </button>
        </header>

        <FilterBar onClearSearch={() => setText('')} />
        <BulkActionBar />

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

          {status === 'loading' && links.length === 0 && visiblePending.length === 0 ? (
            <p className="text-xs text-muted">Loading links…</p>
          ) : links.length === 0 && visiblePending.length === 0 ? (
            hasFilters ? (
              <EmptyState
                title="No matching links"
                description="Nothing matches the current search or filters."
                action={
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => {
                      setText('')
                      void clearFilters()
                    }}
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <EmptyState
                title="No links yet"
                description="Copy a URL anywhere and Linkster will capture it automatically — or add one manually with the button above."
              />
            )
          ) : (
            <>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
                {visiblePending.map((item) => (
                  <PendingLinkCard key={item.id} pending={item} />
                ))}
                {links.map((link) => (
                  <LinkCard key={link.id} link={link} />
                ))}
              </div>
              {loadingMore ? (
                <p className="py-3 text-center text-xs text-muted">Loading more…</p>
              ) : hasMore ? (
                <p className="py-3 text-center text-xs text-muted">Scroll for more</p>
              ) : null}
            </>
          )}
        </div>
      </main>

      {addDialogOpen ? <AddLinkDialog onClose={() => setAddDialogOpen(false)} /> : null}
      {paletteOpen ? (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onAddLink={() => setAddDialogOpen(true)}
        />
      ) : null}
      <UndoToast />
    </div>
  )
}
