/**
 * Supabase requests use the runtime's `fetch`, which carries no client-side
 * deadline. When the Supabase origin stalls (e.g. a Cloudflare 522), a request
 * stays pending until the transport gives up (undici allows up to 5 minutes per
 * attempt) and PostgREST then retries idempotent methods, so launch-time
 * queries can freeze the interface for ~20 minutes. Auth refreshes have the
 * same problem inside `getSession()`.
 *
 * This wrapper aborts every attempt after `timeoutMs` with an `AbortError`.
 * The abort doubles as a retry circuit breaker: PostgREST and auth-js classify
 * it as an aborted request, so it fails fast instead of being replayed.
 */
export const SUPABASE_TIMEOUT_MS = 15_000
export const SUPABASE_TIMEOUT_MESSAGE = 'The server did not respond in time.'

export function createTimeoutFetch(
  fetchImpl: typeof fetch,
  timeoutMs: number = SUPABASE_TIMEOUT_MS
): typeof fetch {
  return (input, init) => {
    const controller = new AbortController()
    const caller = init?.signal ?? null
    const forwardAbort = (): void => controller.abort()
    if (caller?.aborted) controller.abort()
    caller?.addEventListener('abort', forwardAbort, { once: true })

    const timer = setTimeout(() => {
      controller.abort(new DOMException(SUPABASE_TIMEOUT_MESSAGE, 'AbortError'))
    }, timeoutMs)

    const done = (): void => {
      clearTimeout(timer)
      caller?.removeEventListener('abort', forwardAbort)
    }

    return fetchImpl(input, { ...init, signal: controller.signal }).finally(done)
  }
}
