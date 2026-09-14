import { useEffect } from 'react'

interface ShortcutHandlers {
  onOpenPalette: () => void
  onAddLink: () => void
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

export function useGlobalShortcuts({ onOpenPalette, onAddLink }: ShortcutHandlers): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
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
  }, [onOpenPalette, onAddLink])
}
