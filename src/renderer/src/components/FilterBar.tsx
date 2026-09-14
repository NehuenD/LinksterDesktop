import { useEffect, useState } from 'react'
import { useLinksStore } from '../store/links-store'

export default function FilterBar() {
  const domain = useLinksStore((state) => state.domain)
  const dateFrom = useLinksStore((state) => state.dateFrom)
  const dateTo = useLinksStore((state) => state.dateTo)
  const setDomain = useLinksStore((state) => state.setDomain)
  const setDateRange = useLinksStore((state) => state.setDateRange)
  const clearAdvancedFilters = useLinksStore((state) => state.clearAdvancedFilters)

  const [text, setText] = useState(domain)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (text !== domain) void setDomain(text)
    }, 300)
    return () => clearTimeout(timer)
  }, [text, domain, setDomain])

  const hasFilters = domain.length > 0 || dateFrom !== null || dateTo !== null

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-subtle px-6 py-2 text-sm">
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Filter by domain"
        className="w-48 rounded-lg border border-subtle bg-raised px-3 py-1.5 text-sm outline-none placeholder:text-muted focus:border-accent"
      />

      <div className="flex items-center gap-2 text-muted">
        <input
          type="date"
          value={dateFrom ?? ''}
          onChange={(event) => void setDateRange(event.target.value || null, dateTo)}
          className="rounded-lg border border-subtle bg-raised px-2 py-1.5 text-sm text-primary outline-none focus:border-accent"
        />
        <span>to</span>
        <input
          type="date"
          value={dateTo ?? ''}
          onChange={(event) => void setDateRange(dateFrom, event.target.value || null)}
          className="rounded-lg border border-subtle bg-raised px-2 py-1.5 text-sm text-primary outline-none focus:border-accent"
        />
      </div>

      {hasFilters ? (
        <button
          type="button"
          onClick={() => {
            setText('')
            void clearAdvancedFilters()
          }}
          className="text-xs text-accent transition hover:opacity-80"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  )
}
