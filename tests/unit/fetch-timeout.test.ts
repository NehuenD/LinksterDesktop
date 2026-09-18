import { createClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTimeoutFetch,
  SUPABASE_TIMEOUT_MESSAGE
} from '../../src/main/auth/fetch-timeout'

/** Transport that accepts the request but never answers until aborted. */
function stalledFetch(onCall?: () => void): typeof fetch {
  return (_input, init) => {
    onCall?.()
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) throw new Error('expected a signal')
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  }
}

describe('createTimeoutFetch', () => {
  afterEach(() => vi.useRealTimers())

  it('aborts a stalled request once the timeout elapses', async () => {
    vi.useFakeTimers()
    const fetchImpl = stalledFetch()
    const request = createTimeoutFetch(fetchImpl, 100)(new URL('https://example.test/links'))

    const rejection = expect(request).rejects.toMatchObject({
      name: 'AbortError',
      message: SUPABASE_TIMEOUT_MESSAGE
    })
    await vi.advanceTimersByTimeAsync(100)
    await rejection
  })

  it('passes a response through and clears its timer', async () => {
    vi.useFakeTimers()
    const response = new Response('ok')
    const fetchImpl = vi.fn(async () => response)
    const input = new URL('https://example.test/links')

    await expect(createTimeoutFetch(fetchImpl, 100)(input)).resolves.toBe(response)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('forwards a caller abort and cleans up', async () => {
    vi.useFakeTimers()
    const caller = new AbortController()
    const request = createTimeoutFetch(stalledFetch(), 10_000)(new URL('https://example.test/'), {
      signal: caller.signal
    })

    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    caller.abort()
    await rejection
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('Supabase client with a bounded fetch', () => {
  it('settles a link list request after the timeout, without PostgREST retries', async () => {
    let calls = 0
    const client = createClient('https://example.supabase.co', 'anon-key', {
      global: { fetch: createTimeoutFetch(stalledFetch(() => (calls += 1)), 30) },
      auth: { persistSession: false, autoRefreshToken: false }
    })

    const startedAt = Date.now()
    const { error } = await client.from('links').select('id')

    expect(Date.now() - startedAt).toBeLessThan(2_000)
    expect(error?.message).toContain(SUPABASE_TIMEOUT_MESSAGE)
    expect(calls).toBe(1)
  })
})
