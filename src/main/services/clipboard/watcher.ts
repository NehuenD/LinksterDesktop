export interface ClipboardWatcher {
  start(): void
  stop(): void
  isRunning(): boolean
}

export interface ClipboardWatcherDeps {
  readText: () => string | Promise<string>
  onChange: (text: string) => void
  intervalMs?: number
}

export const POLL_INTERVAL_MS = 1000

/**
 * Timer-based clipboard watcher. Works on every platform with no native
 * dependency; used when the native event addon is unavailable.
 */
export function createPollingWatcher(deps: ClipboardWatcherDeps): ClipboardWatcher {
  const intervalMs = deps.intervalMs ?? POLL_INTERVAL_MS
  let timer: ReturnType<typeof setInterval> | null = null
  let last: string | null = null
  let reading = false

  const tick = async (): Promise<void> => {
    if (reading) return
    reading = true
    try {
      const text = await deps.readText()
      if (text === last) return
      last = text
      if (text.length > 0) deps.onChange(text)
    } catch {
      // Transient clipboard access failures are ignored.
    } finally {
      reading = false
    }
  }

  return {
    start() {
      if (timer === null) timer = setInterval(() => void tick(), intervalMs)
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
      last = null
    },
    isRunning() {
      return timer !== null
    }
  }
}
