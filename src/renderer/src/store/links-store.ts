import { create } from 'zustand'
import type { Link, LinkFilter, LinkQuery, LinkStats } from '@shared/contract/ipc'
import { api } from '../lib/api'

const emptyStats: LinkStats = { total: 0, unread: 0, archived: 0, byLabel: {} }

interface LinksStore {
  links: Link[]
  stats: LinkStats
  labels: string[]
  filter: LinkFilter
  selectedLabel: string | null
  search: string
  status: 'idle' | 'loading' | 'error'
  error: string | null
  load: () => Promise<void>
  setFilter: (filter: LinkFilter) => Promise<void>
  setLabel: (label: string | null) => Promise<void>
  setSearch: (search: string) => Promise<void>
}

export const useLinksStore = create<LinksStore>((set, get) => ({
  links: [],
  stats: emptyStats,
  labels: [],
  filter: 'all',
  selectedLabel: null,
  search: '',
  status: 'idle',
  error: null,

  load: async () => {
    set({ status: 'loading', error: null })
    const { filter, selectedLabel, search } = get()

    const query: LinkQuery = { filter }
    if (selectedLabel) query.label = selectedLabel
    if (search.trim().length > 0) query.search = search.trim()

    const [linksResult, statsResult, labelsResult] = await Promise.all([
      api.links.list(query),
      api.links.stats(),
      api.labels.list()
    ])

    const error =
      (!linksResult.ok && linksResult.error.message) ||
      (!statsResult.ok && statsResult.error.message) ||
      null

    set({
      links: linksResult.ok ? linksResult.data : [],
      stats: statsResult.ok ? statsResult.data : emptyStats,
      labels: labelsResult.ok ? labelsResult.data : [],
      status: error ? 'error' : 'idle',
      error
    })
  },

  setFilter: async (filter) => {
    set({ filter })
    await get().load()
  },

  setLabel: async (label) => {
    set({ selectedLabel: label })
    await get().load()
  },

  setSearch: async (search) => {
    set({ search })
    await get().load()
  }
}))
