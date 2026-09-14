import { create } from 'zustand'
import type { ThemeMode } from '@shared/contract/ipc'
import { api } from '../lib/api'

interface ThemeStore {
  mode: ThemeMode
  load: () => Promise<void>
  setMode: (mode: ThemeMode) => Promise<void>
}

export const useThemeStore = create<ThemeStore>((set) => ({
  mode: 'system',
  load: async () => {
    const result = await api.system.getTheme()
    if (result.ok) set({ mode: result.data })
  },
  setMode: async (mode) => {
    const result = await api.system.setTheme(mode)
    if (result.ok) set({ mode: result.data })
  }
}))
