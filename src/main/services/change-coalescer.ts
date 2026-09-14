export interface ChangeCoalescer {
  schedule: () => void
  flush: () => void
  dispose: () => void
}

/**
 * Collapses a burst of change notifications into a single deferred flush.
 */
export function createChangeCoalescer(onFlush: () => void, delayMs = 250): ChangeCoalescer {
  let timer: ReturnType<typeof setTimeout> | null = null

  return {
    schedule() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        onFlush()
      }, delayMs)
    },
    flush() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      onFlush()
    },
    dispose() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }
  }
}
