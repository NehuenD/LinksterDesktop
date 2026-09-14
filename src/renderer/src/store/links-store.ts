import { create } from 'zustand'
import { ok } from '@shared/contract/ipc'
import {
  DEFAULT_PAGE_SIZE,
  type CreateLinkInput,
  type IpcResult,
  type Link,
  type LinkFilter,
  type LinkQuery,
  type LinkStats,
  type UpdateLinkPatch
} from '@shared/contract/ipc'
import { api } from '../lib/api'
import { reportError } from './toast-store'

const emptyStats: LinkStats = { total: 0, unread: 0, archived: 0, byLabel: {} }

interface AdvancedFilters {
  domain: string
  dateFrom: string | null
  dateTo: string | null
}

interface LinksStore extends AdvancedFilters {
  links: Link[]
  stats: LinkStats
  labels: string[]
  filter: LinkFilter
  selectedLabel: string | null
  search: string
  status: 'idle' | 'loading' | 'error'
  error: string | null
  hasMore: boolean
  loadingMore: boolean
  selectedIds: string[]
  lastDeleted: Link[] | null

  load: () => Promise<void>
  loadMore: () => Promise<void>
  setFilter: (filter: LinkFilter) => Promise<void>
  setLabel: (label: string | null) => Promise<void>
  setSearch: (search: string) => Promise<void>
  setDomain: (domain: string) => Promise<void>
  setDateRange: (dateFrom: string | null, dateTo: string | null) => Promise<void>
  clearAdvancedFilters: () => Promise<void>

  createLink: (input: CreateLinkInput) => Promise<IpcResult<Link>>
  updateLink: (id: string, patch: UpdateLinkPatch) => Promise<IpcResult<Link>>
  deleteLink: (id: string) => Promise<IpcResult<true>>
  bulkUpdate: (patch: UpdateLinkPatch) => Promise<IpcResult<true>>
  bulkDelete: () => Promise<IpcResult<true>>
  refreshMetadata: (id: string) => Promise<IpcResult<Link>>
  undoDelete: () => Promise<void>
  dismissUndo: () => void

  toggleSelection: (id: string) => void
  clearSelection: () => void
  selectAllVisible: () => void

  createLabel: (name: string) => Promise<IpcResult<string[]>>
  renameLabel: (oldName: string, newName: string) => Promise<IpcResult<string[]>>
  mergeLabel: (source: string, target: string) => Promise<IpcResult<string[]>>
  deleteLabel: (name: string) => Promise<IpcResult<string[]>>
}

function buildQuery(
  state: Pick<
    LinksStore,
    'filter' | 'selectedLabel' | 'search' | 'domain' | 'dateFrom' | 'dateTo'
  >,
  offset: number
): LinkQuery {
  const query: LinkQuery = { filter: state.filter, limit: DEFAULT_PAGE_SIZE, offset }
  if (state.selectedLabel) query.label = state.selectedLabel
  if (state.search.trim().length > 0) query.search = state.search.trim()
  if (state.domain.trim().length > 0) query.domain = state.domain.trim()
  if (state.dateFrom) query.dateFrom = `${state.dateFrom}T00:00:00.000Z`
  if (state.dateTo) query.dateTo = `${state.dateTo}T23:59:59.999Z`
  return query
}

export const useLinksStore = create<LinksStore>((set, get) => ({
  links: [],
  stats: emptyStats,
  labels: [],
  filter: 'all',
  selectedLabel: null,
  search: '',
  domain: '',
  dateFrom: null,
  dateTo: null,
  status: 'idle',
  error: null,
  hasMore: false,
  loadingMore: false,
  selectedIds: [],
  lastDeleted: null,

  load: async () => {
    set({ status: 'loading', error: null, selectedIds: [] })
    const state = get()

    const [linksResult, statsResult, labelsResult] = await Promise.all([
      api.links.list(buildQuery(state, 0)),
      api.links.stats(),
      api.labels.list()
    ])

    const error =
      (!linksResult.ok && linksResult.error.message) ||
      (!statsResult.ok && statsResult.error.message) ||
      null

    const items = linksResult.ok ? linksResult.data : []

    set({
      links: items,
      stats: statsResult.ok ? statsResult.data : emptyStats,
      labels: labelsResult.ok ? labelsResult.data : [],
      hasMore: items.length === DEFAULT_PAGE_SIZE,
      status: error ? 'error' : 'idle',
      error
    })
  },

  loadMore: async () => {
    const state = get()
    if (!state.hasMore || state.loadingMore) return

    set({ loadingMore: true })
    const result = await api.links.list(buildQuery(state, state.links.length))

    set((current) => ({
      links: result.ok ? [...current.links, ...result.data] : current.links,
      hasMore: result.ok ? result.data.length === DEFAULT_PAGE_SIZE : false,
      loadingMore: false
    }))
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

  setDomain: async (domain) => {
    set({ domain })
    await get().load()
  },

  setDateRange: async (dateFrom, dateTo) => {
    set({ dateFrom, dateTo })
    await get().load()
  },

  clearAdvancedFilters: async () => {
    set({ domain: '', dateFrom: null, dateTo: null })
    await get().load()
  },

  createLink: async (input) => {
    const result = await api.links.create(input)
    if (result.ok) await get().load()
    else reportError(result.error.message)
    return result
  },

  updateLink: async (id, patch) => {
    const result = await api.links.update(id, patch)
    if (result.ok) await get().load()
    else reportError(result.error.message)
    return result
  },

  deleteLink: async (id) => {
    const link = get().links.find((item) => item.id === id) ?? null
    const result = await api.links.delete(id)
    if (result.ok) {
      if (link) set({ lastDeleted: [link] })
      await get().load()
    } else {
      reportError(result.error.message)
    }
    return result
  },

  bulkUpdate: async (patch) => {
    const ids = get().selectedIds
    if (ids.length === 0) return ok(true as const)

    const result = await api.links.bulkUpdate(ids, patch)
    if (result.ok) {
      set({ selectedIds: [] })
      await get().load()
    } else {
      reportError(result.error.message)
    }
    return result
  },

  bulkDelete: async () => {
    const ids = get().selectedIds
    if (ids.length === 0) return ok(true as const)

    const snapshot = get().links.filter((link) => ids.includes(link.id))
    const result = await api.links.bulkDelete(ids)
    if (result.ok) {
      set({ selectedIds: [], lastDeleted: snapshot })
      await get().load()
    } else {
      reportError(result.error.message)
    }
    return result
  },

  refreshMetadata: async (id) => {
    const result = await api.links.refreshMetadata(id)
    if (result.ok) await get().load()
    else reportError(result.error.message)
    return result
  },

  undoDelete: async () => {
    const deleted = get().lastDeleted
    if (!deleted || deleted.length === 0) return

    for (const link of deleted) {
      await api.links.create({
        url: link.url,
        title: link.title,
        description: link.description,
        thumbnailUrl: link.thumbnailUrl,
        label: link.label
      })
    }
    set({ lastDeleted: null })
    await get().load()
  },

  dismissUndo: () => set({ lastDeleted: null }),

  toggleSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((value) => value !== id)
        : [...state.selectedIds, id]
    })),

  clearSelection: () => set({ selectedIds: [] }),

  selectAllVisible: () => set((state) => ({ selectedIds: state.links.map((link) => link.id) })),

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
