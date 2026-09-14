import { create } from 'zustand'
import type {
  CreateLinkInput,
  IpcResult,
  Link,
  LinkFilter,
  LinkQuery,
  LinkStats,
  UpdateLinkPatch
} from '@shared/contract/ipc'
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
  createLink: (input: CreateLinkInput) => Promise<IpcResult<Link>>
  updateLink: (id: string, patch: UpdateLinkPatch) => Promise<IpcResult<Link>>
  deleteLink: (id: string) => Promise<IpcResult<true>>
  refreshMetadata: (id: string) => Promise<IpcResult<Link>>
  createLabel: (name: string) => Promise<IpcResult<string[]>>
  renameLabel: (oldName: string, newName: string) => Promise<IpcResult<string[]>>
  mergeLabel: (source: string, target: string) => Promise<IpcResult<string[]>>
  deleteLabel: (name: string) => Promise<IpcResult<string[]>>
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
  },

  createLink: async (input) => {
    const result = await api.links.create(input)
    if (result.ok) await get().load()
    return result
  },

  updateLink: async (id, patch) => {
    const result = await api.links.update(id, patch)
    if (result.ok) await get().load()
    return result
  },

  deleteLink: async (id) => {
    const result = await api.links.delete(id)
    if (result.ok) await get().load()
    return result
  },

  refreshMetadata: async (id) => {
    const result = await api.links.refreshMetadata(id)
    if (result.ok) await get().load()
    return result
  },

  createLabel: async (name) => {
    const result = await api.labels.create(name)
    if (result.ok) set({ labels: result.data })
    return result
  },

  renameLabel: async (oldName, newName) => {
    const result = await api.labels.rename(oldName, newName)
    if (result.ok) {
      set({ labels: result.data })
      await get().load()
    }
    return result
  },

  mergeLabel: async (source, target) => {
    const result = await api.labels.merge(source, target)
    if (result.ok) {
      set({ labels: result.data })
      await get().load()
    }
    return result
  },

  deleteLabel: async (name) => {
    const result = await api.labels.delete(name)
    if (result.ok) {
      set({ labels: result.data })
      await get().load()
    }
    return result
  }
}))
