import { create } from 'zustand'
import type { ReaderContent } from '@shared/contract/ipc'
import { api } from '../lib/api'

const FONT_KEY = 'linkster.reader.fontSize'
const WIDTH_KEY = 'linkster.reader.maxWidth'

const DEFAULT_FONT_SIZE = 17
const DEFAULT_MAX_WIDTH = 680

function readNumber(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? Number(raw) : Number.NaN
    return Number.isFinite(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function writeNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // Preferences are best-effort.
  }
}

interface ReaderStore {
  content: ReaderContent | null
  status: 'idle' | 'loading' | 'error'
  error: string | null
  fontSize: number
  maxWidth: number
  load: (linkId: string) => Promise<void>
  setFontSize: (fontSize: number) => void
  setMaxWidth: (maxWidth: number) => void
  reset: () => void
}

let currentId: string | null = null

export const useReaderStore = create<ReaderStore>((set) => ({
  content: null,
  status: 'idle',
  error: null,
  fontSize: readNumber(FONT_KEY, DEFAULT_FONT_SIZE),
  maxWidth: readNumber(WIDTH_KEY, DEFAULT_MAX_WIDTH),

  load: async (linkId) => {
    currentId = linkId
    set({ status: 'loading', error: null, content: null })
    const result = await api.links.getContent(linkId)
    if (currentId !== linkId) return
    if (result.ok) set({ content: result.data, status: 'idle', error: null })
    else set({ status: 'error', error: result.error.message })
  },

  setFontSize: (fontSize) => {
    writeNumber(FONT_KEY, fontSize)
    set({ fontSize })
  },

  setMaxWidth: (maxWidth) => {
    writeNumber(WIDTH_KEY, maxWidth)
    set({ maxWidth })
  },

  reset: () => {
    currentId = null
    set({ content: null, status: 'idle', error: null })
  }
}))
