import type { ReactNode } from 'react'

/** Selection toolbar shared by the isolated sections. */
export default function SectionBulkBar({
  count,
  onClear,
  children
}: {
  count: number
  onClear: () => void
  children: ReactNode
}) {
  if (count === 0) return null

  return (
    <div
      className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-md border border-subtle bg-panel px-3 py-2 text-xs shadow-panel"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span className="mr-auto font-medium text-primary">{count} selected</span>
      {children}
      <button
        type="button"
        onClick={onClear}
        className="text-muted transition hover:text-primary"
      >
        Clear
      </button>
    </div>
  )
}
