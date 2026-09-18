import { create } from 'zustand'
import { initialAuthState, type AuthStateSnapshot } from '@shared/contract/ipc'
import { api } from '../lib/api'
import { useLinksStore } from './links-store'
import { reportError } from './toast-store'
import { useUiStore } from './ui-store'
import { useXStore } from './x-store'
import { useYouTubeStore } from './youtube-store'

interface AuthStore extends AuthStateSnapshot {
  apply: (snapshot: AuthStateSnapshot) => void
  refresh: () => Promise<void>
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

function resetUserScopedStores(): void {
  // Drop all user-scoped renderer state so a different account cannot see it.
  useLinksStore.getState().reset()
  useYouTubeStore.getState().reset()
  useXStore.getState().reset()
  useUiStore.getState().setView('library')
}

// Tracks the last signed-in account so auth transitions coming from the main
// process (session expiry, deep-link errors) reset stores too — not only the
// explicit signOut action.
let lastUserKey: string | null = null

export const useAuthStore = create<AuthStore>((set) => ({
  ...initialAuthState,
  apply: (snapshot) => {
    const key = snapshot.status === 'authenticated' ? (snapshot.user?.id ?? null) : null
    if (key !== lastUserKey) {
      resetUserScopedStores()
      lastUserKey = key
    }
    set(snapshot)
  },
  refresh: async () => {
    const result = await api.auth.getState()
    if (result.ok) set(result.data)
    else set({ status: 'error', error: result.error.message })
  },
  signIn: async () => {
    set({ status: 'loading', error: null })
    const result = await api.auth.signInWithGoogle()
    if (!result.ok) set({ status: 'error', error: result.error.message })
  },
  signOut: async () => {
    const result = await api.auth.signOut()
    if (!result.ok) {
      reportError(result.error.message)
      return
    }
    resetUserScopedStores()
    lastUserKey = null
  }
}))
