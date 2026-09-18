import { useEffect } from 'react'
import { useUiStore } from '../store/ui-store'

/**
 * Escape returns to the library from a full-screen section. Open modals handle
 * Escape themselves (capture phase + stopPropagation), so this never steals it.
 */
export function useEscapeToLibrary(): void {
  const setView = useUiStore((state) => state.setView)

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      setView('library')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setView])
}
