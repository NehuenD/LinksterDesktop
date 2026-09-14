import { create } from 'zustand'
import { api } from '../lib/api'

interface ClipboardStore {
  monitoring: boolean
  intervalMs: number
  native: boolean
  load: () => Promise<void>
  setMonitoring: (monitoring: boolean) => Promise<void>
}

export const useClipboardStore = create<ClipboardStore>((set) => ({
  monitoring: false,
  intervalMs: 1000,
  native: false,
  load: async () => {
    const result = await api.clipboard.getStatus()
    if (result.ok) {
      set({
        monitoring: result.data.monitoring,
        intervalMs: result.data.intervalMs,
        native: result.data.native
      })
    }
  },
  setMonitoring: async (monitoring) => {
    const result = await api.clipboard.setMonitoring(monitoring)
    if (result.ok) set({ monitoring: result.data })
  }
}))
