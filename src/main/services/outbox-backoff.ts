export const BACKOFF_BASE_MS = 2_000
export const BACKOFF_MAX_MS = 5 * 60_000
export const BACKOFF_JITTER = 0.2

/**
 * Exponential backoff with symmetric jitter, capped so a sustained outage
 * cannot hammer Supabase. `attempts` is 1-based (the attempt about to be made).
 */
export function computeBackoffDelay(attempts: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, attempts - 1)
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** exponent)
  const jitter = base * BACKOFF_JITTER * (random() * 2 - 1)
  return Math.max(0, Math.round(base + jitter))
}
