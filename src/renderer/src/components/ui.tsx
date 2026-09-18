import { useId, type ReactNode } from 'react'
import { useModalBehavior } from './use-modal'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs">
      <span className="font-medium text-muted">{label}</span>
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
  const ref = useModalBehavior(onClose)
  const titleId = useId()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md overflow-hidden rounded-xl border border-subtle bg-panel shadow-panel outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-subtle px-4 py-3">
          <h2 id={titleId} className="font-display text-sm font-semibold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-6 w-6 items-center justify-center rounded-md text-base leading-none text-muted transition hover:bg-hover hover:text-primary"
          >
            ×
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
