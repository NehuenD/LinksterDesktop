export interface ChangeCoalescer {
  schedule: () => void
  flush: () => void
  dispose: () => void
  /** Re-enables scheduling after a dispose (realtime restart). */
  resume: () => void
}

/**
 * Collapses a burst of change notifications into a single deferred flush.
 */
export function createChangeCoalescer(onFlush: () => void, delayMs = 250): ChangeCoalescer {
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const clear = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    schedule() {
      if (disposed) return
      clear()
      timer = setTimeout(() => {
        timer = null
        onFlush()
      }, delayMs)
    },
    flush() {
      if (disposed) return
      clear()
      onFlush()
    },
    dispose() {
      disposed = true
      clear()
    },
    resume() {
      disposed = false
    }
  }
}
