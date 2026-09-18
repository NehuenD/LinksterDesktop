import { randomUUID } from 'node:crypto'
import { shell } from 'electron'
import type { User } from '@supabase/supabase-js'
import type { AuthStatus, AuthUser } from '@shared/contract/ipc'
import { getAuthState, setAuthState } from './auth-state'
import { dbErrorMessage } from '../data/db-error'
import { OAUTH_CALLBACK_URL, parseAuthCallback } from './deep-link'
import { isSupabaseConfigured, supabase } from './supabase'
import { computeBackoffDelay } from '../services/outbox-backoff'
import { startRealtime, stopRealtime } from '../services/realtime-service'
import { isSafeExternalUrl } from '../services/url-validator'

const SIGN_IN_TIMEOUT_MS = 120_000

let signInTimeout: ReturnType<typeof setTimeout> | null = null
let authRecoveryAttempts = 0
let authRecoveryTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Bumped by every applied auth transition. Async refreshes capture the value
 * before awaiting and discard their result when a newer transition has landed
 * in the meantime (e.g. an interactive sign-in finishing first).
 */
let authGeneration = 0

interface PendingSignIn {
  /** OAuth `state` echo used to ignore forged/stale callbacks. */
  state: string
  /** PKCE flow id so a second attempt cannot corrupt the first verifier. */
  flowId: string | null
}

let pendingSignIn: PendingSignIn | null = null

function clearSignInTimeout(): void {
  if (signInTimeout) {
    clearTimeout(signInTimeout)
    signInTimeout = null
  }
}

/**
 * auth-js reports aborted or network-level fetches as `AuthRetryableFetchError`
 * (status 0) and retries them itself. It also preserves the stored session on
 * these failures, so they are transient by contract: the next refresh attempt
 * can still succeed without the user signing in again.
 */
function isTransientAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, status } = error as { name?: unknown; status?: unknown }
  if (name === 'AuthRetryableFetchError') return true
  if (status === 0) return true
  return typeof status === 'number' && status >= 500
}

function clearAuthRecovery(): void {
  authRecoveryAttempts = 0
  if (authRecoveryTimer) {
    clearTimeout(authRecoveryTimer)
    authRecoveryTimer = null
  }
}

function scheduleAuthRecovery(): void {
  if (authRecoveryTimer) return
  authRecoveryAttempts += 1
  authRecoveryTimer = setTimeout(() => {
    authRecoveryTimer = null
    // A sign-in is the user's explicit choice; let it finish before recovery
    // touches the auth state again.
    if (getAuthState().status === 'loading') {
      scheduleAuthRecovery()
      return
    }
    void refreshAuthState()
  }, computeBackoffDelay(authRecoveryAttempts))
}

function toAuthUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null
  const metadata = user.user_metadata ?? {}
  return {
    id: user.id,
    email: user.email ?? null,
    name: (metadata.full_name as string) ?? (metadata.name as string) ?? null,
    avatarUrl: (metadata.avatar_url as string) ?? null
  }
}

function applyAuth(state: {
  status: AuthStatus
  user: AuthUser | null
  error: string | null
}): void {
  authGeneration += 1
  if (state.status !== 'loading') clearSignInTimeout()
  // A confirmed session supersedes any pending recovery retry; otherwise a
  // stale timer could later apply an unauthenticated state over a valid one.
  if (state.status === 'authenticated') clearAuthRecovery()
  setAuthState(state)
  // Any non-authenticated state (signed out or errored) must tear down the
  // realtime channel; otherwise a stale subscription keeps receiving changes.
  if (state.status === 'authenticated') {
    startRealtime()
  } else {
    stopRealtime()
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function refreshAuthState(): Promise<void> {
  const generation = authGeneration
  if (!isSupabaseConfigured) {
    clearAuthRecovery()
    applyAuth({
      status: 'error',
      user: null,
      error: 'Supabase is not configured. Add credentials to .env.'
    })
    return
  }

  const { data, error } = await supabase.auth.getSession()
  // A newer transition (interactive sign-in, sign-out) finished while this
  // refresh was in flight; its result is stale.
  if (generation !== authGeneration) return

  if (error) {
    if (isTransientAuthError(error)) {
      // A transient refresh failure must not look like a terminal sign-in
      // error: the session is still stored and auth-js keeps retrying. Stay
      // actionable (login screen, no error) and drive a retry so recovery does
      // not depend on the library's background tick alone.
      const status = getAuthState().status
      if (status === 'initial') {
        applyAuth({ status: 'unauthenticated', user: null, error: null })
      }
      // A sign-in in flight ('loading') and an already-authenticated session
      // both stay put until a retry proves otherwise: flipping the UI to the
      // login screen here would abort or log out a valid session over a
      // network blip.
      scheduleAuthRecovery()
      return
    }
    clearAuthRecovery()
    applyAuth({ status: 'error', user: null, error: dbErrorMessage(error) })
    return
  }

  clearAuthRecovery()
  const user = toAuthUser(data.session?.user)
  applyAuth({
    status: user ? 'authenticated' : 'unauthenticated',
    user,
    error: null
  })
}

export function subscribeToAuthChanges(): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!isSupabaseConfigured) return
    const current = getAuthState()
    const user = toAuthUser(session?.user)
    // A late INITIAL_SESSION/null-session event must not erase a terminal error
    // the user needs to see (e.g. invalid refresh token, bad configuration).
    if (!user && current.status === 'error' && current.error) return
    applyAuth({
      status: user ? 'authenticated' : 'unauthenticated',
      user,
      error: null
    })
  })

  return () => data.subscription.unsubscribe()
}

export async function signInWithGoogle(): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Add credentials to .env.')
  }

  applyAuth({ status: 'loading', user: getAuthState().user, error: null })

  const state = randomUUID()
  pendingSignIn = { state, flowId: null }

  clearSignInTimeout()
  signInTimeout = setTimeout(() => {
    signInTimeout = null
    pendingSignIn = null
    if (getAuthState().status === 'loading') {
      applyAuth({ status: 'unauthenticated', user: null, error: null })
    }
  }, SIGN_IN_TIMEOUT_MS)

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: OAUTH_CALLBACK_URL,
        skipBrowserRedirect: true,
        queryParams: { state }
      }
    })

    if (error) throw new Error(dbErrorMessage(error))
    // Remember the PKCE flow so a later "try again" cannot overwrite this
    // attempt's verifier and this callback exchanges against the right slot.
    if (pendingSignIn) pendingSignIn.flowId = data.flowId ?? null
    if (data.url) {
      if (!isSafeExternalUrl(data.url)) {
        throw new Error('Refusing to open a non-http(s) sign-in URL.')
      }
      await shell.openExternal(data.url)
    }
  } catch (error) {
    pendingSignIn = null
    applyAuth({ status: 'unauthenticated', user: null, error: errorMessage(error) })
    throw error
  }
}

export async function completeSignInFromDeepLink(url: string): Promise<void> {
  const { code, error, state } = parseAuthCallback(url)
  const pending = pendingSignIn
  const isPendingCallback = pending !== null && (state === null || state === pending.state)

  if (error) {
    // Without a matching pending flow this is a forged or stale callback (any
    // local process can open the custom scheme); never let it lock the UI.
    if (!isPendingCallback) return
    pendingSignIn = null
    applyAuth({ status: 'error', user: null, error })
    return
  }
  if (!code) return
  if (pending !== null && !isPendingCallback) return

  try {
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(
      code,
      pending?.flowId ? { flowId: pending.flowId } : undefined
    )
    if (exchangeError) {
      if (isPendingCallback) {
        pendingSignIn = null
        applyAuth({ status: 'error', user: null, error: dbErrorMessage(exchangeError) })
      }
      return
    }

    pendingSignIn = null
    const user = toAuthUser(data.session?.user)
    applyAuth({
      status: user ? 'authenticated' : 'unauthenticated',
      user,
      error: null
    })
  } catch (error) {
    // Storage/keyring failures rethrow out of auth-js; never leave the main
    // process with an unhandled rejection from a fire-and-forget deep link.
    const message = errorMessage(error)
    if (isPendingCallback) {
      pendingSignIn = null
      applyAuth({ status: 'error', user: null, error: message })
    } else {
      console.warn('[auth] deep-link sign-in failed:', message)
    }
  }
}

export async function signOut(): Promise<void> {
  pendingSignIn = null
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(dbErrorMessage(error))
  applyAuth({ status: 'unauthenticated', user: null, error: null })
}
