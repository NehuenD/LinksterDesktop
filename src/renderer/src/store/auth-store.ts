import { create } from 'zustand'
import { initialAuthState, type AuthStateSnapshot } from '@shared/contract/ipc'
import { api } from '../lib/api'

interface AuthStore extends AuthStateSnapshot {
  apply: (snapshot: AuthStateSnapshot) => void
  refresh: () => Promise<void>
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  ...initialAuthState,
  apply: (snapshot) => set(snapshot),
  refresh: async () => {
    const result = await api.auth.getState()
    if (result.ok) set(result.data)
  },
  signIn: async () => {
    set({ status: 'loading', error: null })
    const result = await api.auth.signInWithGoogle()
    if (!result.ok) set({ status: 'error', error: result.error.message })
  },
  signOut: async () => {
    await api.auth.signOut()
  }
}))
