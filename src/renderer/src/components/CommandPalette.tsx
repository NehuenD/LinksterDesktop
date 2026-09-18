import { useEffect, useMemo, useRef, useState } from 'react'
import type { Link } from '@shared/contract/ipc'
import { filterPaletteItems, type PaletteItem } from '@shared/lib/palette'
import { api } from '../lib/api'
import { useLinksStore } from '../store/links-store'
import { useModalBehavior } from './use-modal'

type Entry = PaletteItem & { run: () => void }

interface CommandPaletteProps {
  onClose: () => void
  onAddLink: () => void
}

const SEARCH_DEBOUNCE_MS = 250
const LINK_RESULT_LIMIT = 10
const ACTION_RESULT_LIMIT = 5

export default function CommandPalette({ onClose, onAddLink }: CommandPaletteProps) {
  const links = useLinksStore((state) => state.links)
  const labels = useLinksStore((state) => state.labels)
  const setLabel = useLinksStore((state) => state.setLabel)
  const setFilter = useLinksStore((state) => state.setFilter)
  const openLink = useLinksStore((state) => state.openLink)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  // Results are stored together with the term they answer so a stale response
  // (or a previous term during the debounce) can never be shown as current.
  const [remote, setRemote] = useState<{ term: string; links: Link[] }>({
    term: '',
    links: []
  })
  const dialogRef = useModalBehavior(onClose)
  const searchRequest = useRef(0)

  // Search links server-side (debounced) so the palette can reach the whole
  // library, not just the loaded page.
  useEffect(() => {
    const term = query.trim()
    // With no query the palette falls back to the loaded page, so there is
    // nothing to fetch.
    if (term.length === 0) return

    const requestId = ++searchRequest.current
    const timer = setTimeout(() => {
      void api.links.list({ search: term, limit: LINK_RESULT_LIMIT }).then((result) => {
        if (requestId === searchRequest.current && result.ok) {
          setRemote({ term, links: result.data })
        }
      })
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  const actionEntries = useMemo<Entry[]>(() => {
    const list: Entry[] = [
      {
        id: 'action:add',
        label: 'Add link',
        kind: 'action',
        keywords: 'new create url',
        run: () => {
          onClose()
          onAddLink()
        }
      },
      {
        id: 'action:unread',
        label: 'Show unread',
        kind: 'action',
        keywords: 'filter',
        run: () => void setFilter('unread')
      },
      {
        id: 'action:archived',
        label: 'Show archived',
        kind: 'action',
        keywords: 'filter',
        run: () => void setFilter('archived')
      },
      {
        id: 'action:all',
        label: 'Show all links',
        kind: 'action',
        keywords: 'filter',
        run: () => void setFilter('all')
      }
    ]

    for (const label of labels) {
      list.push({
        id: `label:${label}`,
        label: `Label: ${label}`,
        kind: 'label',
        keywords: 'filter label',
        run: () => void setLabel(label)
      })
    }

    return list
  }, [labels, onAddLink, onClose, setFilter, setLabel])

  const actionResults = useMemo(
    () => filterPaletteItems(actionEntries, query, ACTION_RESULT_LIMIT),
    [actionEntries, query]
  )

  const linkEntries = useMemo<Entry[]>(() => {
    // Server results are already filtered by the query; only fall back to the
    // loaded page for an empty query. Results are only used when they answer
    // the exact current term.
    const term = query.trim()
    const source =
      term.length > 0 && remote.term === term
        ? remote.links
        : term.length === 0
          ? links.slice(0, LINK_RESULT_LIMIT)
          : []
    return source.map((link) => ({
      id: `link:${link.id}`,
      label: link.title ?? link.url,
      hint: link.url,
      kind: 'link' as const,
      keywords: `${link.label} ${link.url}`,
      run: () => openLink(link)
    }))
  }, [query, remote, links, openLink])

  const results = useMemo(
    () => [...actionResults, ...linkEntries].slice(0, LINK_RESULT_LIMIT + ACTION_RESULT_LIMIT),
    [actionResults, linkEntries]
  )

  const runEntry = (entry: Entry | undefined): void => {
    if (!entry) return
    onClose()
    entry.run()
  }

  const runActive = () => runEntry(results[active])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-6 pt-28 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabIndex={-1}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-subtle bg-panel shadow-panel outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((value) => Math.min(value + 1, Math.max(0, results.length - 1)))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((value) => Math.max(0, value - 1))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              runActive()
            } else if (event.key === 'Escape') {
              onClose()
            }
          }}
          placeholder="Search all links, labels and actions…"
          className="w-full border-b border-subtle bg-transparent px-4 py-2.5 text-xs outline-none placeholder:text-muted"
        />

        <ul className="max-h-80 overflow-y-auto p-1">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted">No matches</li>
          ) : (
            results.map((entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onClick={() => runEntry(entry)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition ${
                    index === active ? 'bg-hover' : ''
                  }`}
                >
                  <span className="rounded border border-subtle bg-raised px-1.5 py-0.5 font-mono text-xs uppercase tracking-wide text-muted">
                    {entry.kind}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {entry.hint ? (
                    <span className="min-w-0 max-w-[40%] truncate text-xs text-muted">
                      {entry.hint}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
