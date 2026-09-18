import { create } from 'zustand'
import {
  DEFAULT_PAGE_SIZE,
  type Link,
  type LinkFilter,
  type LinkQuery,
  type LinkSort
} from '@shared/contract/ipc'
import { settleIpc } from '@shared/lib/ipc-call'
import { hasMetadataChanges } from '@shared/lib/link-metadata'
import { toRestoreLinkInput } from '@shared/lib/link-restore'
import { rangeSelection, toggleId } from '@shared/lib/selection'
import { api } from '../lib/api'
import { openExternal } from '../lib/open-external'
import { UNDO_WINDOW_MS, useLinksStore } from './links-store'
import { useSettingsStore } from './settings-store'
import { reportError, reportInfo, reportSuccess } from './toast-store'

const YOUTUBE_KIND: Pick<LinkQuery, 'kind'> = { kind: 'youtube' }

// Discards pagination results that arrive after a refresh replaced the list.
let generation = 0

function youtubeQuery(
  state: Pick<YouTubeStore, 'filter' | 'search' | 'sort'>,
  offset: number
): LinkQuery {
  return {
    ...YOUTUBE_KIND,
    filter: state.filter,
    sort: state.sort,
    search: state.search.trim() || undefined,
    limit: DEFAULT_PAGE_SIZE,
    offset
  }
}

interface YouTubeStore {
  items: Link[]
  /** All videos, unwatched only, or archived only (server-filtered). */
  filter: LinkFilter
  /** Server-side search over title/description/author. */
  search: string
  sort: LinkSort
  status: 'idle' | 'loading' | 'error'
  error: string | null
  hasMore: boolean
  loadingMore: boolean
  /** Inline failure for an append page; keeps the grid usable with a retry. */
  loadMoreError: string | null
  /** Multi-select for bulk triage. */
  selectedIds: string[]
  selectionAnchorId: string | null
  /** Deleted-video snapshots offered by the undo bar. */
  lastDeleted: Link[]
  undoExpiresAt: number | null
  load: () => Promise<void>
  loadMore: () => Promise<void>
  setFilter: (filter: LinkFilter) => Promise<void>
  setSearch: (search: string) => Promise<void>
  setSort: (sort: LinkSort) => Promise<void>
  clearQuery: () => Promise<void>
  toggleSelection: (id: string) => void
  selectRange: (id: string) => void
  clearSelection: () => void
  bulkRead: () => Promise<void>
  bulkArchive: () => Promise<void>
  bulkDelete: () => Promise<void>
  refresh: (link: Link) => Promise<void>
  open: (link: Link) => void
  toggleRead: (link: Link) => Promise<void>
  markAllWatched: () => Promise<void>
  toggleArchived: (link: Link) => Promise<void>
  remove: (link: Link) => Promise<void>
  undoRemove: () => Promise<void>
  dismissUndo: () => void
  reset: () => void
}

export const useYouTubeStore = create<YouTubeStore>((set, get) => ({
  items: [],
  filter: 'all',
  search: '',
  sort: 'newest',
  status: 'idle',
  error: null,
  hasMore: false,
  loadingMore: false,
  loadMoreError: null,
  selectedIds: [],
  selectionAnchorId: null,
  lastDeleted: [],
  undoExpiresAt: null,

  load: async () => {
    const current = (generation += 1)
    set({ status: 'loading', error: null, loadingMore: false, loadMoreError: null })
    const result = await settleIpc(() => api.links.list(youtubeQuery(get(), 0)))
    if (current !== generation) return
    if (result.ok) {
      set({
        items: result.data,
        hasMore: result.data.length === DEFAULT_PAGE_SIZE,
        status: 'idle',
        error: null
      })
    } else {
      set({ status: 'error', error: result.error.message })
    }
  },

  loadMore: async () => {
    const state = get()
    if (!state.hasMore || state.loadingMore || state.status === 'loading') return

    const current = generation
    set({ loadingMore: true, loadMoreError: null })
    const result = await settleIpc(() => api.links.list(youtubeQuery(state, state.items.length)))
    // A refresh (or another load) replaced the list while this page was in
    // flight; appending it would duplicate or skip rows.
    if (current !== generation) return

    set((currentState) => ({
      items: result.ok ? [...currentState.items, ...result.data] : currentState.items,
      // A transient failure must not disable pagination until a manual refresh.
      hasMore: result.ok ? result.data.length === DEFAULT_PAGE_SIZE : currentState.hasMore,
      loadingMore: false,
      loadMoreError: result.ok ? null : result.error.message
    }))
  },

  setFilter: async (filter) => {
    if (get().filter === filter) return
    set({ filter, selectedIds: [], selectionAnchorId: null })
    await get().load()
  },

  setSearch: async (search) => {
    if (get().search === search) return
    set({ search, selectedIds: [], selectionAnchorId: null })
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
        state.items.map((item) => item.id),
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
    reportSuccess(ids.length === 1 ? 'Marked as watched' : `Marked ${ids.length} as watched`)
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
    reportSuccess(ids.length === 1 ? 'Video archived' : `${ids.length} videos archived`)
    set({ selectedIds: [], selectionAnchorId: null })
    await get().load()
    await useLinksStore.getState().load()
  },

  bulkDelete: async () => {
    const ids = get().selectedIds
    if (ids.length === 0) return

    // YouTube rows are full Links, so the snapshots come from the loaded page.
    const snapshots = get().items.filter((item) => ids.includes(item.id))
    const result = await settleIpc(() => api.links.bulkDelete(ids))
    if (!result.ok) {
      reportError(result.error.message)
      return
    }
    set({
      selectedIds: [],
      selectionAnchorId: null,
      lastDeleted: snapshots,
      undoExpiresAt: snapshots.length > 0 ? Date.now() + UNDO_WINDOW_MS : null
    })
    await get().load()
    await useLinksStore.getState().load()
  },

  refresh: async (link) => {
    const result = await settleIpc(() => api.links.refreshMetadata(link.id))
    if (!result.ok) {
      reportError(result.error.message)
      return
    }
    // A failed/empty fetch keeps the existing values; don't claim a refresh.
    if (hasMetadataChanges(link, result.data)) reportSuccess('Metadata refreshed')
    else reportInfo('No new metadata found')
    await get().load()
  },

  open: (link) => {
    // Playback always happens on YouTube; the in-app view is not a player.
    void openExternal(link.url)

    if (link.isRead || link.isArchived) return
    if (!useSettingsStore.getState().reading.markReadOnOpen) return

    set((state) => ({
      items: state.items.map((item) => (item.id === link.id ? { ...item, isRead: true } : item))
    }))
    void settleIpc(() => api.links.update(link.id, { isRead: true })).then(async (result) => {
      if (!result.ok) {
        reportError(result.error.message)
        await get().load()
      }
    })
  },

  toggleRead: async (link) => {
    const next = !link.isRead
    set((state) => ({
      items: state.items.map((item) => (item.id === link.id ? { ...item, isRead: next } : item))
    }))
    const result = await settleIpc(() => api.links.update(link.id, { isRead: next }))
    if (!result.ok) {
      reportError(result.error.message)
      await get().load()
      return
    }
    // Under the unwatched filter a watched video no longer belongs in the list.
    if (get().filter === 'unread') await get().load()
  },

  markAllWatched: async () => {
    const state = get()
    // Mirror the visible result set: an active search/sort must not be ignored
    // or "mark all" silently affects every unwatched video.
    const query: LinkQuery = {
      ...YOUTUBE_KIND,
      filter: state.filter,
      sort: state.sort,
      ...(state.search.trim() ? { search: state.search.trim() } : {})
    }
    const result = await settleIpc(() => api.links.markAllRead(query))
    if (!result.ok) {
      reportError(result.error.message)
      return
    }
    if (result.data.updated > 0) {
      reportSuccess(`Marked ${result.data.updated} as watched`)
      await get().load()
      await useLinksStore.getState().load()
    } else {
      reportInfo('Nothing new to mark as watched')
    }
  },

  toggleArchived: async (link) => {
    const next = !link.isArchived
    set((state) => ({
      items: state.items.map((item) =>
        item.id === link.id ? { ...item, isArchived: next } : item
      )
    }))
    const result = await settleIpc(() => api.links.update(link.id, { isArchived: next }))
    if (!result.ok) {
      reportError(result.error.message)
    }
    await get().load()
    // Keep the sidebar/library counts in sync with the change.
    await useLinksStore.getState().load()
  },

  remove: async (link) => {
    const result = await settleIpc(() => api.links.delete(link.id))
    if (!result.ok) {
      reportError(result.error.message)
      return
    }
    set((state) => ({ items: state.items.filter((item) => item.id !== link.id) }))
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

  reset: () => {
    generation += 1
    set({
      items: [],
      filter: 'all',
      search: '',
      sort: 'newest',
      status: 'idle',
      error: null,
      hasMore: false,
      loadingMore: false,
      loadMoreError: null,
      selectedIds: [],
      selectionAnchorId: null,
      lastDeleted: [],
      undoExpiresAt: null
    })
  }
}))
