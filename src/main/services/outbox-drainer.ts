export const DEFAULT_DRAIN_INTERVAL_MS = 30_000

export interface OutboxDrainerDeps {
  drain: () => Promise<unknown>
  intervalMs?: number
  /** Cheap connectivity gate for scheduled passes; manual triggers ignore it. */
  canDrain?: () => boolean
}

export interface OutboxDrainer {
  /** Runs a drain, coalescing concurrent calls into at most one queued pass. */
  trigger: () => Promise<void>
  start: () => void
  stop: () => void
  isRunning: () => boolean
}

/**
 * Drives the outbox drain loop. A single drain runs at a time; extra triggers
 * collapse into one follow-up pass so bursts of enqueues do not stampede Supabase.
 */
export function createOutboxDrainer({
  drain,
  intervalMs = DEFAULT_DRAIN_INTERVAL_MS,
  canDrain = () => true
}: OutboxDrainerDeps): OutboxDrainer {
  let active: Promise<void> | null = null
  let queued = false
  let timer: ReturnType<typeof setInterval> | null = null

  async function run(): Promise<void> {
    try {
      await drain()
    } catch {
      // Drain failures are recorded per item; the loop must keep going.
    } finally {
      active = null
      if (queued) {
        queued = false
        await trigger()
      }
    }
  }

  function trigger(): Promise<void> {
    if (active) {
      queued = true
      return active
    }
    active = run()
    return active
  }

  function start(): void {
    if (timer !== null) return
    timer = setInterval(() => {
      if (canDrain()) void trigger()
    }, intervalMs)
  }

  function stop(): void {
    if (timer === null) return
    clearInterval(timer)
    timer = null
  }

  return { trigger, start, stop, isRunning: () => active !== null }
}
