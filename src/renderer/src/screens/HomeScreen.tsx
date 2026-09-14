import { useEffect, useState } from 'react'
import AddLinkDialog from '../components/AddLinkDialog'
import BulkActionBar from '../components/BulkActionBar'
import CommandPalette from '../components/CommandPalette'
import EmptyState from '../components/EmptyState'
import FilterBar from '../components/FilterBar'
import LinkCard from '../components/LinkCard'
import Sidebar from '../components/Sidebar'
import UndoToast from '../components/UndoToast'
import { api } from '../lib/api'
import { useGlobalShortcuts } from '../lib/use-global-shortcuts'
import { useClipboardStore } from '../store/clipboard-store'
import { useLinksStore } from '../store/links-store'
import { useUiStore } from '../store/ui-store'
import ScreenshotsScreen from './ScreenshotsScreen'
import SettingsScreen from './SettingsScreen'

export default function HomeScreen() {
  const load = useLinksStore((state) => state.load)
  const loadMore = useLinksStore((state) => state.loadMore)
  const links = useLinksStore((state) => state.links)
  const status = useLinksStore((state) => state.status)
  const error = useLinksStore((state) => state.error)
  const hasMore = useLinksStore((state) => state.hasMore)
  const loadingMore = useLinksStore((state) => state.loadingMore)
  const search = useLinksStore((state) => state.search)
  const setSearch = useLinksStore((state) => state.setSearch)
  const monitoring = useClipboardStore((state) => state.monitoring)
  const loadClipboard = useClipboardStore((state) => state.load)
  const setMonitoring = useClipboardStore((state) => state.setMonitoring)
  const view = useUiStore((state) => state.view)
  const paletteOpen = useUiStore((state) => state.paletteOpen)
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen)

  const [text, setText] = useState(search)
  const [adding, setAdding] = useState(false)

  useGlobalShortcuts({
    onOpenPalette: () => setPaletteOpen(true),
    onAddLink: () => setAdding(true)
  })

  useEffect(() => {
    void load()
    void loadClipboard()
  }, [load, loadClipboard])

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

  if (view === 'settings') {
    return <SettingsScreen />
  }

  if (view === 'screenshots') {
    return <ScreenshotsScreen />
  }

  return (
    <div className="flex h-full overflow-hidden bg-surface text-primary">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-subtle px-6 py-4">
          <input
            id="linkster-search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search links…  (press /)"
            className="w-full max-w-md rounded-lg border border-subtle bg-raised px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
          />

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="rounded-lg border border-subtle px-3 py-2 text-sm text-muted transition hover:bg-hover"
            title="Command palette (Ctrl/Cmd+K)"
          >
            Ctrl+K
          </button>

          <button
            type="button"
            onClick={() => void setMonitoring(!monitoring)}
            className="flex items-center gap-2 rounded-lg border border-subtle px-3 py-2 text-sm transition hover:bg-hover"
            title="Automatically save URLs copied to the clipboard"
          >
            <span className={`h-2 w-2 rounded-full ${monitoring ? 'bg-emerald-500' : 'bg-muted'}`} />
            Auto-capture {monitoring ? 'on' : 'off'}
          </button>

          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Add link
          </button>
        </header>

        <FilterBar />
        <BulkActionBar />

        <div className="min-h-0 flex-1 overflow-y-auto p-6" onScroll={(event) => {
          const element = event.currentTarget
          if (element.scrollHeight - element.scrollTop - element.clientHeight < 400) {
            void loadMore()
          }
        }}>
          {error ? (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm"
            >
              {error}
            </div>
          ) : null}

          {status === 'loading' && links.length === 0 ? (
            <p className="text-sm text-muted">Loading links…</p>
          ) : links.length === 0 ? (
            <EmptyState
              title="No links found"
              description="Copy a URL anywhere and Linkster will capture it automatically."
            />
          ) : (
            <>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                {links.map((link) => (
                  <LinkCard key={link.id} link={link} />
                ))}
              </div>
              {loadingMore ? (
                <p className="py-4 text-center text-sm text-muted">Loading more…</p>
              ) : hasMore ? (
                <p className="py-4 text-center text-sm text-muted">Scroll for more</p>
              ) : null}
            </>
          )}
        </div>
      </main>

      {adding ? <AddLinkDialog onClose={() => setAdding(false)} /> : null}
      {paletteOpen ? (
        <CommandPalette onClose={() => setPaletteOpen(false)} onAddLink={() => setAdding(true)} />
      ) : null}
      <UndoToast />
    </div>
  )
}
