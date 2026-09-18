/**
 * Serializes async passes of the same kind. Concurrent callers never run two
 * passes at once: they share the in-flight pass, and at most one follow-up pass
 * runs afterwards so work enqueued mid-pass is still processed.
 */
export function createDrainGate<T>(run: () => Promise<T>): () => Promise<T> {
  let active: Promise<T> | null = null
  let followUp: Promise<T> | null = null

  function drain(): Promise<T> {
    if (!active) {
      active = Promise.resolve()
        .then(() => run())
        .finally(() => {
          active = null
        })
      return active
    }

    if (!followUp) {
      // `.finally` (not `.then`) clears the slot on rejection too; otherwise a
      // single failed pass would poison every follow-up for the process life.
      followUp = active
        .then(() => drain())
        .finally(() => {
          followUp = null
        })
    }
    return followUp
  }

  return drain
}
