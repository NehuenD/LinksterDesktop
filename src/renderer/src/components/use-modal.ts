import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Tracks open modals so only the topmost one handles Escape / Tab (nested
// dialogs such as the label-manager confirm must not close their parent).
const modalStack: symbol[] = []

/** Global shortcuts and background hotkeys must not fire while a modal is open. */
export function hasOpenModal(): boolean {
  return modalStack.length > 0
}

/**
 * Accessible-dialog behaviour: moves focus inside, traps Tab, closes on Escape,
 * and restores focus to the previously focused element on unmount. Only the
 * topmost modal responds, so nested dialogs behave correctly.
 */
export function useModalBehavior(onClose: () => void): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const token = Symbol('modal')
    modalStack.push(token)
    const node = ref.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = (): HTMLElement[] =>
      node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : []

    const field = node?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
    )
    const target = field ?? focusables()[0] ?? node
    target?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (modalStack[modalStack.length - 1] !== token) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !node) return
      const items = focusables().filter((element) => element.offsetParent !== null)
      if (items.length === 0) {
        event.preventDefault()
        node.focus()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey) {
        if (active === first || !node.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || !node.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      const index = modalStack.indexOf(token)
      if (index >= 0) modalStack.splice(index, 1)
      previouslyFocused?.focus?.()
    }
  }, [])

  return ref
}
