import { create } from 'zustand'
import type { Link, XPost, XPostFilter, XPostQuery, XPostSort } from '@shared/contract/ipc'
import { settleIpc } from '@shared/lib/ipc-call'
import { toRestoreLinkInput } from '@shared/lib/link-restore'
import { rangeSelection, toggleId } from '@shared/lib/selection'
import { api } from '../lib/api'
import { openExternal } from '../lib/open-external'
import { UNDO_WINDOW_MS, useLinksStore } from './links-store'
import { useSettingsStore } from './settings-store'
import { reportError, reportSuccess } from './toast-store'

interface XStore {
  items: XPost[]
  total: number
  status: 'idle' | 'loading' | 'error'
  error: string | null
  hasMore: boolean
  loadingMore: boolean
  /** Inline failure for an append page; keeps the grid usable with a retry. */
  loadMoreError: string | null
  /** Section toolbar query (server-side search/filter/sort). */
  search: string
  filter: XPostFilter
  sort: XPostSort
  /** Multi-select for bulk triage; ids are persisted link ids. */
  selectedIds: string[]
  selectionAnchorId: string | null
  /** Deleted-post snapshots offered by the undo bar; PNGs are never restored. */
  lastDeleted: Link[]
  undoExpiresAt: number | null
  load: () => Promise<void>
  loadMore: () => Promise<void>
  setSearch: (search: string) => Promise<void>
  setFilter: (filter: XPostFilter) => Promise<void>
  setSort: (sort: XPostSort) => Promise<void>
  clearQuery: () => Promise<void>
  toggleSelection: (id: string) => void
  selectRange: (id: string) => void
  clearSelection: () => void
  bulkRead: () => Promise<void>
  bulkArchive: () => Promise<void>
  bulkDelete: () => Promise<void>
  open: (post: XPost) => void
  retryCapture: (linkId: string) => Promise<void>
  retryPending: (outboxId: string) => Promise<void>
  discardPending: (outboxId: string) => Promise<void>
  revealCapture: (linkId: string) => Promise<void>
  openCapture: (linkId: string) => Promise<void>
  deleteCapture: (linkId: string) => Promise<void>
  getCapturePreview: (linkId: string) => Promise<string | null>
  removePost: (post: XPost) => Promise<void>
  undoRemove: () => Promise<void>
  dismissUndo: () => void
  toggleRead: (post: XPost) => Promise<void>
  toggleArchived: (post: XPost) => Promise<void>
  reset: () => void
}

function buildQuery(
  state: Pick<XStore, 'search' | 'filter' | 'sort'>,
  offset: number
): XPostQuery {
  return {
    search: state.search.trim() || undefined,
    filter: state.filter,
    sort: state.sort,
    offset
  }
}

// Invalidates in-flight list requests when the query changes or the store is
// reset, so a slow response can never overwrite a newer one.
let xLoadGeneration = 0

export const useXStore = create<XStore>((set, get) => ({
  items: [],
  total: 0,
  status: 'idle',
  error: null,
  hasMore: false,
  loadingMore: false,
  loadMoreError: null,
  search: '',
  filter: 'all',
  sort: 'newest',
  selectedIds: [],
  selectionAnchorId: null,
  lastDeleted: [],
  undoExpiresAt: null,

  load: async () => {
    const generation = ++xLoadGeneration
    set({ status: 'loading', error: null, loadingMore: false, loadMoreError: null })
    const result = await settleIpc(() => api.x.list(buildQuery(get(), 0)))
    if (generation !== xLoadGeneration) return
    if (result.ok) {
      set({
        items: result.data.items,
        total: result.data.total,
        hasMore: result.data.hasMore,
        loadingMore: false,
        status: 'idle',
        error: null
      })
    } else {
      set({ status: 'error', error: result.error.message })
    }
  },

  loadMore: async () => {
    const state = get()
    if (!state.hasMore || state.loadingMore) return

    const generation = xLoadGeneration
    // The server offset counts persisted posts; queued (outbox) cards are
    // prepended on the first page only.
    const offset = state.items.filter((post) => post.linkId !== null).length
    set({ loadingMore: true, loadMoreError: null })
    const result = await settleIpc(() => api.x.list(buildQuery(state, offset)))

    if (generation !== xLoadGeneration) return
    set((current) => ({
      items: result.ok ? [...current.items, ...result.data.items] : current.items,
      total: result.ok ? result.data.total : current.total,
      hasMore: result.ok ? result.data.hasMore : current.hasMore,
      loadingMore: false,
      loadMoreError: result.ok ? null : result.error.message
    }))
  },

  setSearch: async (search) => {
    if (get().search === search) return
    set({ search, selectedIds: [], selectionAnchorId: null })
    await get().load()
  },

  setFilter: async (filter) => {
    if (get().filter === filter) return
    set({ filter, selectedIds: [], selectionAnchorId: null })
    await get().load()
  },

  setSort: async (sort) => {
    if (get().sort === sort) return
    set({ sort, selectedIds: [], selectionAnchorId: null })
    await get().load()
  },

  clearQuery: async () => {
    const state = get()
    if (state.search === '' && state.filter === 'all' && state.sort === 'newest') return
    set({ search: '', filter: 'all', sort: 'newest', selectedIds: [], selectionAnchorId: null })
    await get().load()
  },

  toggleSelection: (id) =>
    set((state) => ({
      selectedIds: toggleId(state.selectedIds, id),
      selectionAnchorId: id
    })),

  selectRange: (id) =>
    set((state) => ({
      selectedIds: rangeSelection(
        state.items
          .map((post) => post.linkId)
          .filter((linkId): linkId is string => linkId !== null),
        state.selectionAnchorId,
        id,
        state.selectedIds
      )
    })),

  clearSelection: () => set({ selectedIds: [], selectionAnchorId: null }),

  bulkRead: async () => {
    const ids = get().selectedIds
    if (ids.length === 0) return
    const result = await settleIpc(() => api.links.bulkUpdate(ids, { isRead: true }))
    if (!result.ok) {
      reportError(result.error.message)
      return
    }
    reportSuccess(ids.length === 1 ? 'Marked as read' : `Marked ${ids.length} as read`)
    set({ selectedIds: [], selectionAnchorId: null })
    await get().load()
    await useLinksStore.getState().load()
  },

  bulkArchive: async () => {
    const ids = get().selectedIds
    if (ids.length === 0) return
    const result = await settleIpc(() => api.links.bulkUpdate(ids, { isArchived: true }))
    if (!result.ok) {
      reportError(result.error.message)
      return
    }
    reportSuccess(ids.length === 1 ? 'Post archived' : `${ids.length} posts archived`)
    set({ selectedIds: [], selectionAnchorId: null })
    await get().load()
    await useLinksStore.getState().load()
  },

  bulkDelete: async () => {
    const ids = get().selectedIds
    if (ids.length === 0) return

    // Delete one by one so each response carries the full-row snapshot the undo
    // bar needs; bulkDelete cannot return per-row snapshots.
    const snapshots: Link[] = []
    for (const id of ids) {
      const result = await settleIpc(() => api.links.delete(id))
      if (result.ok) {
        if (result.data) snapshots.push(result.data)
      } else {
        reportError(result.error.message)
      }
    }

    set({ selectedIds: [], selectionAnchorId: null })
    if (snapshots.length > 0) {
      set({ lastDeleted: snapshots, undoExpiresAt: Date.now() + UNDO_WINDOW_MS })
    }
    await get().load()
    await useLinksStore.getState().load()
  },

  open: (post) => {
    void openExternal(post.url)

    if (!post.linkId || post.isRead) return
    if (!useSettingsStore.getState().reading.markReadOnOpen) return

    set((state) => ({
      items: state.items.map((item) =>
        item.linkId === post.linkId ? { ...item, isRead: true } : item
      )
    }))
    const linkId = post.linkId
    void settleIpc(() => api.links.update(linkId, { isRead: true })).then(async (result) => {
      if (!result.ok) {
        reportError(result.error.message)
        await get().load()
      }
    })
  },

  retryCapture: async (linkId) => {
    const result = await settleIpc(() => api.x.retryCapture(linkId))
    if (!result.ok) {
      reportError(result.error.message)
    } else if (result.data.completed) {
      // A requeue/backoff pass is not a finished capture — stay silent until a
      // PNG actually exists instead of toasting a false success.
      reportSuccess('Capture succeeded')
    }
    await get().load()
  },

  retryPending: async (outboxId) => {
    await useLinksStore.getState().retryPending(outboxId)
    await get().load()
  },

  discardPending: async (outboxId) => {
    const result = await settleIpc(() => api.links.discardPending(outboxId))
    if (!result.ok) reportError(result.error.message)
    await get().load()
  },

  revealCapture: async (linkId) => {
    const result = await settleIpc(() => api.x.revealCapture(linkId))
    if (!result.ok) reportError(result.error.message)
  },

  openCapture: async (linkId) => {
    const result = await settleIpc(() => api.x.openCapture(linkId))
    if (!result.ok) reportError(result.error.message)
  },

  deleteCapture: async (linkId) => {
    const result = await settleIpc(() => api.x.deleteCapture(linkId))
    if (result.ok) {
      reportSuccess('Capture deleted')
      await get().load()
    } else {
      reportError(result.error.message)
    }
  },

  getCapturePreview: async (linkId) => {
    const result = await settleIpc(() => api.x.getCapture(linkId))
    if (!result.ok) {
      reportError(result.error.message)
      return null
    }
    return result.data?.dataUrl ?? null
  },

  removePost: async (post) => {
    if (!post.linkId) return
    const result = await settleIpc(() => api.links.delete(post.linkId as string))
    if (!result.ok) {
      reportError(result.error.message)
      return
    }
    set((state) => ({ items: state.items.filter((item) => item.linkId !== post.linkId) }))
    if (result.data) {
      set({ lastDeleted: [result.data], undoExpiresAt: Date.now() + UNDO_WINDOW_MS })
    }
    await get().load()
    await useLinksStore.getState().load()
  },

  undoRemove: async () => {
    const deleted = get().lastDeleted
    if (deleted.length === 0) return

    set({ lastDeleted: [], undoExpiresAt: null })
    const result = await settleIpc(() =>
      api.links.restore(deleted.map(toRestoreLinkInput))
    )
    if (!result.ok) {
      reportError(result.error.message)
    } else if (result.data.restored < result.data.requested) {
      const missing = result.data.requested - result.data.restored
      reportError(`Restored ${result.data.restored} of ${result.data.requested}; ${missing} could not be restored.`)
    }
    await get().load()
    await useLinksStore.getState().load()
  },

  dismissUndo: () => set({ lastDeleted: [], undoExpiresAt: null }),

  toggleRead: async (post) => {
    if (!post.linkId) return
    const next = !post.isRead
    set((state) => ({
      items: state.items.map((item) =>
        item.linkId === post.linkId ? { ...item, isRead: next } : item
      )
    }))
    const result = await settleIpc(() =>
      api.links.update(post.linkId as string, { isRead: next })
    )
    if (!result.ok) {
      reportError(result.error.message)
      await get().load()
      return
    }
    // Keep the unread filter honest and the sidebar count fresh.
    if (get().filter === 'unread') await get().load()
    void useLinksStore.getState().load()
  },

  toggleArchived: async (post) => {
    if (!post.linkId) return
    const next = !post.isArchived
    set((state) => ({
      items: state.items.map((item) =>
        item.linkId === post.linkId ? { ...item, isArchived: next } : item
      )
    }))
    const result = await settleIpc(() =>
      api.links.update(post.linkId as string, { isArchived: next })
    )
    if (!result.ok) {
      reportError(result.error.message)
    } else {
      void useLinksStore.getState().load()
    }
    await get().load()
  },

  reset: () => {
    xLoadGeneration += 1
    set({
      items: [],
      total: 0,
      status: 'idle',
      error: null,
      hasMore: false,
      loadingMore: false,
      loadMoreError: null,
      search: '',
      filter: 'all',
      sort: 'newest',
      selectedIds: [],
      selectionAnchorId: null,
      lastDeleted: [],
      undoExpiresAt: null
    })
  }
}))
