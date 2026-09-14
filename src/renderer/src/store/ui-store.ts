import { create } from 'zustand'

export type AppView = 'library' | 'settings'

interface UiStore {
  view: AppView
  paletteOpen: boolean
  setView: (view: AppView) => void
  setPaletteOpen: (open: boolean) => void
}

export const useUiStore = create<UiStore>((set) => ({
  view: 'library',
  paletteOpen: false,
  setView: (view) => set({ view }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen })
}))
