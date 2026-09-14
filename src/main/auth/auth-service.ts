import { shell } from 'electron'
import type { User } from '@supabase/supabase-js'
import type { AuthUser } from '@shared/contract/ipc'
import { getAuthState, setAuthState } from './auth-state'
import { OAUTH_CALLBACK_URL, parseAuthCallback } from './deep-link'
import { isSupabaseConfigured, supabase } from './supabase'

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

export async function refreshAuthState(): Promise<void> {
  if (!isSupabaseConfigured) {
    setAuthState({
      status: 'error',
      user: null,
      error: 'Supabase is not configured. Add credentials to .env.'
    })
    return
  }

  const { data, error } = await supabase.auth.getSession()
  if (error) {
    setAuthState({ status: 'error', user: null, error: error.message })
    return
  }

  const user = toAuthUser(data.session?.user)
  setAuthState({
    status: user ? 'authenticated' : 'unauthenticated',
    user,
    error: null
  })
}

export function subscribeToAuthChanges(): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const user = toAuthUser(session?.user)
    setAuthState({
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

  setAuthState({ status: 'loading', user: getAuthState().user, error: null })

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: OAUTH_CALLBACK_URL,
      skipBrowserRedirect: true
    }
  })

  if (error) throw new Error(error.message)
  if (data.url) await shell.openExternal(data.url)
}

export async function completeSignInFromDeepLink(url: string): Promise<void> {
  const { code, error } = parseAuthCallback(url)

  if (error) {
    setAuthState({ status: 'error', user: null, error })
    return
  }
  if (!code) return

  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    setAuthState({ status: 'error', user: null, error: exchangeError.message })
    return
  }

  const user = toAuthUser(data.session?.user)
  setAuthState({
    status: user ? 'authenticated' : 'unauthenticated',
    user,
    error: null
  })
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
  setAuthState({ status: 'unauthenticated', user: null, error: null })
}
