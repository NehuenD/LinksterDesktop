import type { ReactNode } from 'react'

export default function EmptyState({
  title,
  description,
  action
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-subtle bg-raised text-muted">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
          <path
            d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <p className="font-display text-sm font-semibold text-primary">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-muted">{description}</p>
      {action ? <div className="mt-1.5">{action}</div> : null}
    </div>
  )
}
