import type { ReactNode } from 'react'

export const inputClass =
  'w-full rounded-lg border border-subtle bg-raised px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent'

export const primaryButtonClass =
  'rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'

export const secondaryButtonClass =
  'rounded-lg border border-subtle px-4 py-2 text-sm text-primary transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  )
}

export function Modal({
  title,
  onClose,
  children
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-subtle bg-surface p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-lg text-muted transition hover:text-primary"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
