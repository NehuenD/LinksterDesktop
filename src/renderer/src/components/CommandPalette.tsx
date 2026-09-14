import { useEffect, useMemo, useState } from 'react'
import { filterPaletteItems, type PaletteItem } from '@shared/lib/palette'
import { api } from '../lib/api'
import { useLinksStore } from '../store/links-store'

type Entry = PaletteItem & { run: () => void }

interface CommandPaletteProps {
  onClose: () => void
  onAddLink: () => void
}

export default function CommandPalette({ onClose, onAddLink }: CommandPaletteProps) {
  const links = useLinksStore((state) => state.links)
  const labels = useLinksStore((state) => state.labels)
  const setLabel = useLinksStore((state) => state.setLabel)
  const setFilter = useLinksStore((state) => state.setFilter)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const entries = useMemo<Entry[]>(() => {
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

    for (const link of links) {
      list.push({
        id: `link:${link.id}`,
        label: link.title ?? link.url,
        hint: link.url,
        kind: 'link',
        keywords: `${link.label} ${link.url}`,
        run: () => void api.system.openExternal(link.url)
      })
    }

    return list
  }, [links, labels, onAddLink, onClose, setFilter, setLabel])

  const results = useMemo(() => filterPaletteItems(entries, query, 10), [entries, query])

  useEffect(() => {
    setActive(0)
  }, [query])

  const runActive = () => {
    const entry = results[active]
    if (!entry) return
    onClose()
    entry.run()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 pt-32"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-subtle bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
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
          placeholder="Search links, labels and actions…"
          className="w-full border-b border-subtle bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted"
        />

        <ul className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted">No matches</li>
          ) : (
            results.map((entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={runActive}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition ${
                    index === active ? 'bg-hover' : ''
                  }`}
                >
                  <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] uppercase text-muted">
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
