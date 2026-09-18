import { useEffect } from 'react'
import { hasOpenModal } from '../components/use-modal'

interface ShortcutHandlers {
  onOpenPalette: () => void
  onAddLink: () => void
  /** Shortcuts only fire on the library view; gated so off-view presses are no-ops. */
  enabled?: boolean
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable
  )
}

export function useGlobalShortcuts({
  onOpenPalette,
  onAddLink,
  enabled = true
}: ShortcutHandlers): void {
  useEffect(() => {
    if (!enabled) return

    const handler = (event: KeyboardEvent): void => {
      // A dialog owns the keyboard while it is open: Cmd+K must not stack the
      // palette on top and `/` must not steal focus behind the overlay.
      if (hasOpenModal()) return

      const mod = event.metaKey || event.ctrlKey

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenPalette()
        return
      }

      const typing = isTypingTarget(event.target)

      if (!typing && event.key === '/') {
        event.preventDefault()
        document.getElementById('linkster-search')?.focus()
        return
      }

      if (!typing && mod && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        onAddLink()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onOpenPalette, onAddLink, enabled])
}
