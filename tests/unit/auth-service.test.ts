import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({
  current: { status: 'initial', user: null, error: null } as {
    status: string
    user: unknown
    error: string | null
  },
  set: vi.fn<(next: { status: string; user: unknown; error: string | null }) => void>()
}))

const client = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn()
}))

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))

vi.mock('../../src/main/auth/auth-state', () => ({
  getAuthState: () => authState.current,
  setAuthState: (next: { status: string; user: unknown; error: string | null }) => {
    authState.current = next
    authState.set(next)
  }
}))

vi.mock('../../src/main/auth/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: client }
}))

vi.mock('../../src/main/services/realtime-service', () => ({
  startRealtime: vi.fn(),
  stopRealtime: vi.fn()
}))

import { refreshAuthState } from '../../src/main/auth/auth-service'

function retryableError(): Error {
  return Object.assign(new Error('The server did not respond in time.'), {
    name: 'AuthRetryableFetchError',
    status: 0,
    __isAuthError: true
  })
}

function terminalError(): Error {
  return Object.assign(new Error('Invalid Refresh Token: Refresh Token Not Found'), {
    name: 'AuthApiError',
    status: 400,
    __isAuthError: true
  })
}

function session(userId: string): { data: { session: unknown }; error: null } {
  return {
    data: { session: { user: { id: userId, email: null, user_metadata: {} } } },
    error: null
  }
}

describe('refreshAuthState', () => {
  beforeEach(() => {
    authState.current = { status: 'initial', user: null, error: null }
    authState.set.mockClear()
    client.getSession.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('applies the stored session', async () => {
    client.getSession.mockResolvedValue(session('u1'))

    await refreshAuthState()

    expect(authState.set).toHaveBeenLastCalledWith({
      status: 'authenticated',
      user: { id: 'u1', email: null, name: null, avatarUrl: null },
      error: null
    })
  })

  it('treats a retryable refresh failure as transient and retries until it recovers', async () => {
    vi.useFakeTimers()
    client.getSession
      .mockResolvedValueOnce({ data: { session: null }, error: retryableError() })
      .mockResolvedValue(session('u1'))

    await refreshAuthState()
    expect(authState.set).toHaveBeenLastCalledWith({
      status: 'unauthenticated',
      user: null,
      error: null
    })

    await vi.advanceTimersByTimeAsync(5_000)
    expect(client.getSession).toHaveBeenCalledTimes(2)
    expect(authState.set).toHaveBeenLastCalledWith({
      status: 'authenticated',
      user: { id: 'u1', email: null, name: null, avatarUrl: null },
      error: null
    })
    // Recovery stops the loop: no further retries remain scheduled.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps retrying while the outage lasts', async () => {
    vi.useFakeTimers()
    client.getSession.mockResolvedValue({ data: { session: null }, error: retryableError() })

    await refreshAuthState()
    await vi.advanceTimersByTimeAsync(5_000)

    expect(client.getSession.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(authState.set).toHaveBeenLastCalledWith({
      status: 'unauthenticated',
      user: null,
      error: null
    })
  })

  it('does not clobber an in-flight sign-in with recovery state', async () => {
    vi.useFakeTimers()
    authState.current = { status: 'loading', user: null, error: null }
    client.getSession.mockResolvedValue({ data: { session: null }, error: retryableError() })

    await refreshAuthState()

    expect(authState.set).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(10_000)
    expect(client.getSession).toHaveBeenCalledTimes(1)
    expect(authState.set).not.toHaveBeenCalled()
  })

  it('surfaces a terminal refresh failure and stops retrying', async () => {
    vi.useFakeTimers()
    client.getSession.mockResolvedValue({ data: { session: null }, error: terminalError() })

    await refreshAuthState()

    expect(authState.set).toHaveBeenLastCalledWith({
      status: 'error',
      user: null,
      error: 'Invalid Refresh Token: Refresh Token Not Found'
    })

    await vi.advanceTimersByTimeAsync(60_000)
    expect(client.getSession).toHaveBeenCalledTimes(1)
  })
})
