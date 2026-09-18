import { create } from 'zustand'

export type AppView = 'library' | 'screenshots' | 'youtube' | 'x' | 'settings'

interface UiStore {
  view: AppView
  paletteOpen: boolean
  addDialogOpen: boolean
  platform: string | null
  readerLinkId: string | null
  setView: (view: AppView) => void
  setPaletteOpen: (open: boolean) => void
  setAddDialogOpen: (open: boolean) => void
  setPlatform: (platform: string) => void
  openReader: (linkId: string) => void
  closeReader: () => void
}

export const useUiStore = create<UiStore>((set) => ({
  view: 'library',
  paletteOpen: false,
  addDialogOpen: false,
  platform: null,
  readerLinkId: null,
  // Library-scoped overlays are dismissed when switching views so they cannot
  // pop back open when the user returns.
  setView: (view) => set({ view, paletteOpen: false, addDialogOpen: false, readerLinkId: null }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setAddDialogOpen: (addDialogOpen) => set({ addDialogOpen }),
  setPlatform: (platform) => set({ platform }),
  openReader: (readerLinkId) => set({ readerLinkId }),
  closeReader: () => set({ readerLinkId: null })
}))
