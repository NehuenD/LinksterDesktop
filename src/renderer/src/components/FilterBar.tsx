import { useEffect, useRef, useState } from 'react'
import type { LinkSort } from '@shared/contract/ipc'
import { useLinksStore } from '../store/links-store'

interface FilterBarProps {
  /** Lets the owner clear its search input when "Clear filters" resets the term. */
  onClearSearch?: () => void
}

export default function FilterBar({ onClearSearch }: FilterBarProps) {
  const domain = useLinksStore((state) => state.domain)
  const dateFrom = useLinksStore((state) => state.dateFrom)
  const dateTo = useLinksStore((state) => state.dateTo)
  const search = useLinksStore((state) => state.search)
  const sort = useLinksStore((state) => state.sort)
  const setDomain = useLinksStore((state) => state.setDomain)
  const setDateRange = useLinksStore((state) => state.setDateRange)
  const setSort = useLinksStore((state) => state.setSort)
  const clearFilters = useLinksStore((state) => state.clearFilters)

  const [text, setText] = useState(domain)
  const lastCommitted = useRef(domain)

  // An external reset (e.g. the empty state's "Clear filters") must win over
  // the local debounce state, otherwise the old domain is re-applied 300ms later.
  useEffect(() => {
    if (domain !== lastCommitted.current) {
      lastCommitted.current = domain
      setText(domain)
    }
  }, [domain])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (text !== domain) {
        lastCommitted.current = text
        void setDomain(text)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [text, domain, setDomain])

  const hasFilters =
    domain.length > 0 || dateFrom !== null || dateTo !== null || search.trim().length > 0

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-4 py-1.5 text-xs">
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Filter by domain"
        className="w-44 rounded-md border border-subtle bg-raised px-2.5 py-1 text-xs outline-none transition placeholder:text-muted focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
      />

      <div className="flex items-center gap-1.5 text-muted">
        <input
          type="date"
          value={dateFrom ?? ''}
          onChange={(event) => void setDateRange(event.target.value || null, dateTo)}
          className="rounded-md border border-subtle bg-raised px-2 py-1 text-xs text-primary outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
        />
        <span className="text-xs text-muted/70">to</span>
        <input
          type="date"
          value={dateTo ?? ''}
          onChange={(event) => void setDateRange(dateFrom, event.target.value || null)}
          className="rounded-md border border-subtle bg-raised px-2 py-1 text-xs text-primary outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
        />
      </div>

      <label className="flex items-center gap-1.5 text-muted">
        <span className="text-xs">Sort</span>
        <select
          value={sort}
          onChange={(event) => void setSort(event.target.value as LinkSort)}
          className="rounded-md border border-subtle bg-raised px-2 py-1 text-xs text-primary outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="title">Title</option>
          <option value="domain">Domain</option>
        </select>
      </label>

      {hasFilters ? (
        <button
          type="button"
          onClick={() => {
            setText('')
            onClearSearch?.()
            void clearFilters()
          }}
          className="text-xs text-accent transition hover:brightness-125"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  )
}
