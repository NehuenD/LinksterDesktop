import { useCallback, useEffect, useRef, useState } from 'react'

export interface CardMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

/**
 * Overflow menu for card actions: keeps the poster readable without clipping
 * action rows on minimum-width cards. Closes on outside click, Escape (without
 * triggering the section-level Escape) and after any item runs; focus moves to
 * the first item and returns to the trigger on close.
 */
export default function CardMenu({
  items,
  label = 'More actions',
  triggerClassName,
  onOpenChange
}: {
  items: CardMenuItem[]
  label?: string
  triggerClassName: string
  /** Lets the owning card raise its z-index while the panel is open. */
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const onOpenChangeRef = useRef(onOpenChange)

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  }, [onOpenChange])

  const setMenuOpen = useCallback((next: boolean) => {
    setOpen(next)
    onOpenChangeRef.current?.(next)
  }, [])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent): void => {
      if (rootRef.current?.contains(event.target as Node)) return
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, setMenuOpen])

  useEffect(() => {
    if (!open) return
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [open])

  const close = (refocus: boolean): void => {
    setMenuOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(event) => {
        if (!open || event.key !== 'Escape') return
        // Mark handled so the screen-level Escape (back to library) stays put.
        event.preventDefault()
        event.stopPropagation()
        close(true)
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setMenuOpen(!open)}
        className={triggerClassName}
      >
        ⋯
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full z-30 mt-1 flex w-44 flex-col rounded-lg border border-subtle bg-panel p-1 text-left shadow-panel"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                close(true)
                item.onClick()
              }}
              className={`rounded-md px-2.5 py-1.5 text-left text-xs transition ${
                item.danger
                  ? 'text-danger hover:bg-danger/10'
                  : 'text-primary hover:bg-hover'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
