import { create } from 'zustand'

export type AppView = 'library' | 'screenshots' | 'settings'

interface UiStore {
  view: AppView
  paletteOpen: boolean
  platform: string | null
  setView: (view: AppView) => void
  setPaletteOpen: (open: boolean) => void
  setPlatform: (platform: string) => void
}

export const useUiStore = create<UiStore>((set) => ({
  view: 'library',
  paletteOpen: false,
  platform: null,
  setView: (view) => set({ view }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setPlatform: (platform) => set({ platform })
}))
