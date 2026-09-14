import { create } from 'zustand'
import type { Screenshot } from '@shared/contract/ipc'
import { api } from '../lib/api'
import { reportError, reportSuccess } from './toast-store'

interface ScreenshotsStore {
  items: Screenshot[]
  folder: string | null
  detected: string | null
  status: 'idle' | 'loading' | 'error'
  error: string | null
  load: () => Promise<void>
  loadFolder: () => Promise<void>
  chooseFolder: () => Promise<void>
  reveal: (filePath: string) => Promise<void>
  copyPath: (filePath: string) => Promise<void>
  remove: (filePath: string) => Promise<void>
}

export const useScreenshotsStore = create<ScreenshotsStore>((set, get) => ({
  items: [],
  folder: null,
  detected: null,
  status: 'idle',
  error: null,

  load: async () => {
    set({ status: 'loading', error: null })
    const result = await api.screenshots.list()
    set({
      items: result.ok ? result.data : [],
      status: result.ok ? 'idle' : 'error',
      error: result.ok ? null : result.error.message
    })
  },

  loadFolder: async () => {
    const result = await api.screenshots.getFolder()
    if (result.ok) set({ folder: result.data.folder, detected: result.data.detected })
  },

  chooseFolder: async () => {
    const result = await api.screenshots.chooseFolder()
    if (result.ok) {
      set({ folder: result.data.folder, detected: result.data.detected })
      await get().load()
    } else {
      reportError(result.error.message)
    }
  },

  reveal: async (filePath) => {
    const result = await api.screenshots.reveal(filePath)
    if (!result.ok) reportError(result.error.message)
  },

  copyPath: async (filePath) => {
    const result = await api.screenshots.copyPath(filePath)
    if (result.ok) reportSuccess('Path copied to clipboard')
    else reportError(result.error.message)
  },

  remove: async (filePath) => {
    const result = await api.screenshots.delete(filePath)
    if (result.ok) {
      set((state) => ({ items: state.items.filter((item) => item.filePath !== filePath) }))
      reportSuccess('Screenshot deleted')
    } else {
      reportError(result.error.message)
    }
  }
}))
