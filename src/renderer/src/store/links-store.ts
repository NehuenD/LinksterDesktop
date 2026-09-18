import { create } from 'zustand'
import { ok } from '@shared/contract/ipc'
import {
  DEFAULT_LABEL,
  DEFAULT_PAGE_SIZE,
  type CreateLinkInput,
  type IpcResult,
  type LabelColors,
  type Link,
  type LinkFilter,
  type LinkQuery,
  type LinkSort,
  type LinkStats,
  type MarkAllReadResult,
  type PendingCapture,
  type RealtimeStatus,
  type UpdateLinkPatch
} from '@shared/contract/ipc'
import { toRestoreLinkInput } from '@shared/lib/link-restore'
import { mergeLinks, type DirtyLinkFields } from '@shared/lib/link-merge'
import { settleIpc } from '@shared/lib/ipc-call'
import { rangeSelection, toggleId } from '@shared/lib/selection'
import { api } from '../lib/api'
import { openExternal } from '../lib/open-external'
import { useSettingsStore } from './settings-store'
import { reportError, reportSuccess } from './toast-store'
import { useUiStore } from './ui-store'

const emptyStats: LinkStats = {
  total: 0,
  unread: 0,
  archived: 0,
  byLabel: {},
  xPosts: 0,
  youtube: 0,
  xPostsUnread: 0,
  youtubeUnwatched: 0
}

/** How long the undo affordance stays available before it auto-dismisses. */
export const UNDO_WINDOW_MS = 7000

/** Upper bound for "select all matching" paging (10k links). */
const SELECT_ALL_MAX_PAGES = 50
const SELECT_ALL_PAGE_SIZE = 200
/** Undo snapshots and restores are chunked at the schema cap. */
const SNAPSHOT_CHUNK_SIZE = 500

// Locally edited fields not yet confirmed by the server, keyed by link id.
// Module-level (not React state) so tracking does not cause re-renders.
const dirtyFields = new Map<string, DirtyLinkFields>()

// Bumped by every load()/reset(); async continuations that finish after a
// newer query started (or after sign-out) are discarded.
let loadGeneration = 0

function markDirty(id: string, fields: Array<keyof Link>): void {
  if (fields.length === 0) return
  const existing = dirtyFields.get(id)
  const merged = existing
    ? Array.from(new Set([...existing.fields, ...fields]))
    : fields
  dirtyFields.set(id, { fields: merged, at: Date.now() })
}

function clearDirty(id: string): void {
  dirtyFields.delete(id)
}

interface AdvancedFilters {
  domain: string
  dateFrom: string | null
  dateTo: string | null
}

interface LinksStore extends AdvancedFilters {
  links: Link[]
  pending: PendingCapture[]
  stats: LinkStats
  labels: string[]
  labelColors: LabelColors
  filter: LinkFilter
  selectedLabel: string | null
  search: string
  searchContent: boolean
  sort: LinkSort
  status: 'idle' | 'loading' | 'error'
  error: string | null
  hasMore: boolean
  loadingMore: boolean
  selectedIds: string[]
  selectionAnchorId: string | null
  lastDeleted: Link[] | null
  undoExpiresAt: number | null
  conflicts: string[]
  realtimeStatus: RealtimeStatus

  load: () => Promise<void>
  loadPending: () => Promise<void>
  retryPending: (id?: string) => Promise<void>
  discardPending: (id: string) => Promise<void>
  loadMore: () => Promise<void>
  setFilter: (filter: LinkFilter) => Promise<void>
  setLabel: (label: string | null) => Promise<void>
  setSearch: (search: string) => Promise<void>
  setSearchContent: (searchContent: boolean) => Promise<void>
  setDomain: (domain: string) => Promise<void>
  setDateRange: (dateFrom: string | null, dateTo: string | null) => Promise<void>
  setSort: (sort: LinkSort) => Promise<void>
  clearFilters: () => Promise<void>

  openLink: (link: Link) => void
  createLink: (input: CreateLinkInput) => Promise<IpcResult<Link>>
  updateLink: (id: string, patch: UpdateLinkPatch) => Promise<IpcResult<Link>>
  deleteLink: (id: string) => Promise<IpcResult<Link | null>>
  bulkUpdate: (patch: UpdateLinkPatch) => Promise<IpcResult<true>>
  bulkDelete: () => Promise<IpcResult<true>>
  clearLabel: () => Promise<IpcResult<true>>
  markAllRead: () => Promise<IpcResult<MarkAllReadResult>>
  refreshMetadata: (id: string) => Promise<IpcResult<Link>>
  undoDelete: () => Promise<void>
  dismissUndo: () => void
  setRealtimeStatus: (status: RealtimeStatus) => void
  reset: () => void

  toggleSelection: (id: string) => void
  selectRange: (id: string) => void
  clearSelection: () => void
  selectAllVisible: () => void
  selectAllMatching: () => Promise<void>

  createLabel: (name: string) => Promise<IpcResult<string[]>>
  renameLabel: (oldName: string, newName: string) => Promise<IpcResult<string[]>>
  mergeLabel: (source: string, target: string) => Promise<IpcResult<string[]>>
  deleteLabel: (name: string) => Promise<IpcResult<string[]>>

  setLabelColor: (name: string, color: string | null) => Promise<IpcResult<LabelColors>>
  refreshLabelColors: () => Promise<void>
}

function buildQuery(
  state: Pick<
    LinksStore,
    | 'filter'
    | 'selectedLabel'
    | 'search'
    | 'searchContent'
    | 'sort'
    | 'domain'
    | 'dateFrom'
    | 'dateTo'
  >,
  offset: number
): LinkQuery {
  const query: LinkQuery = { filter: state.filter, sort: state.sort, limit: DEFAULT_PAGE_SIZE, offset }
  if (state.selectedLabel) query.label = state.selectedLabel
  if (state.search.trim().length > 0) {
    query.search = state.search.trim()
    query.searchContent = state.searchContent
  }
  if (state.domain.trim().length > 0) query.domain = state.domain.trim()
  if (state.dateFrom) query.dateFrom = new Date(`${state.dateFrom}T00:00:00`).toISOString()
  if (state.dateTo) query.dateTo = new Date(`${state.dateTo}T23:59:59.999`).toISOString()
  return query
}

/** User-scoped state reset on sign-out. */
const initialLinksData = {
  links: [] as Link[],
  pending: [] as PendingCapture[],
  stats: emptyStats,
  labels: [] as string[],
  labelColors: {} as LabelColors,
  filter: 'all' as LinkFilter,
  selectedLabel: null as string | null,
  search: '',
  searchContent: true,
  sort: 'newest' as LinkSort,
  domain: '',
  dateFrom: null as string | null,
  dateTo: null as string | null,
  status: 'idle' as LinksStore['status'],
  error: null as string | null,
  hasMore: false,
  loadingMore: false,
  selectedIds: [] as string[],
  selectionAnchorId: null as string | null,
  lastDeleted: null as Link[] | null,
  undoExpiresAt: null as number | null,
  conflicts: [] as string[],
  realtimeStatus: 'INITIAL' as RealtimeStatus
}

export const useLinksStore = create<LinksStore>((set, get) => ({
  ...initialLinksData,

  load: async () => {
    const generation = ++loadGeneration
    set({ status: 'loading', error: null })
    const state = get()
    const previous = state.links

    const [linksResult, statsResult, labelsResult, colorsResult] = await Promise.all([
      settleIpc(() => api.links.list(buildQuery(state, 0))),
      settleIpc(() => api.links.stats()),
      settleIpc(() => api.labels.list()),
      settleIpc(() => api.labels.getColors())
    ])

    // A newer load (filter/search change, realtime refresh, reset) started while
    // this one was in flight; installing this response would show stale data.
    if (generation !== loadGeneration) return

    const error =
      (!linksResult.ok && linksResult.error.message) ||
      (!statsResult.ok && statsResult.error.message) ||
      (!labelsResult.ok && labelsResult.error.message) ||
      (!colorsResult.ok && colorsResult.error.message) ||
      null

    // On a list failure, keep the current page visible rather than blanking the grid.
    const merged = linksResult.ok
      ? mergeLinks(previous, linksResult.data, dirtyFields)
      : { links: previous, conflicts: state.conflicts }
    const items = linksResult.ok ? linksResult.data : []

    set({
      links: merged.links,
      conflicts: merged.conflicts,
      // Ancillary failures keep the last known counts/labels instead of
      // zeroing the sidebar over a transient IPC hiccup.
      stats: statsResult.ok ? statsResult.data : state.stats,
      labels: labelsResult.ok ? labelsResult.data : state.labels,
      labelColors: colorsResult.ok ? colorsResult.data : state.labelColors,
      hasMore: linksResult.ok ? items.length === DEFAULT_PAGE_SIZE : state.hasMore,
      status: error ? 'error' : 'idle',
      error
    })
  },

  loadPending: async () => {
    const result = await api.links.pendingList()
    if (result.ok) set({ pending: result.data })
  },

  retryPending: async (id) => {
    await api.links.retryPending(id)
    await get().loadPending()
    await get().load()
  },

  discardPending: async (id) => {
    const result = await api.links.discardPending(id)
    if (result.ok) await get().loadPending()
    else reportError(result.error.message)
  },

  loadMore: async () => {
    const state = get()
    if (!state.hasMore || state.loadingMore) return

    const generation = loadGeneration
    const offset = state.links.length
    set({ loadingMore: true })
    const result = await api.links.list(buildQuery(state, offset))

    // The query changed (or the store was reset) while this page was loading;
    // appending it would mix results from two different queries.
    if (generation !== loadGeneration) return
    if (!result.ok) reportError(result.error.message)

    set((current) => {
      if (!result.ok) return { loadingMore: false }
      const existing = new Set(current.links.map((link) => link.id))
      const appended = result.data.filter((link) => !existing.has(link.id))
      return {
        links: [...current.links, ...appended],
        hasMore: result.data.length === DEFAULT_PAGE_SIZE,
        loadingMore: false
      }
    })
  },

  setFilter: async (filter) => {
    set({ filter, selectedIds: [], selectionAnchorId: null })
    await get().load()
  },

  setLabel: async (label) => {
    set({ selectedLabel: label, selectedIds: [], selectionAnchorId: null })
    await get().load()
  },

  setSearch: async (search) => {
    set({ search, selectedIds: [], selectionAnchorId: null })
    await get().load()
  },

  setSearchContent: async (searchContent) => {
    set({ searchContent })
    await get().load()
  },

  setDomain: async (domain) => {
    set({ domain, selectedIds: [], selectionAnchorId: null })
    await get().load()
  },

  setDateRange: async (dateFrom, dateTo) => {
    set({ dateFrom, dateTo, selectedIds: [], selectionAnchorId: null })
    await get().load()
  },

  setSort: async (sort) => {
    set({ sort, selectedIds: [], selectionAnchorId: null })
    await get().load()
  },

  clearFilters: async () => {
    set({
      filter: 'all',
      selectedLabel: null,
      search: '',
      domain: '',
      dateFrom: null,
      dateTo: null,
      selectedIds: [],
      selectionAnchorId: null
    })
    await get().load()
  },

  openLink: (link) => {
    const opensReader =
      link.extractionStatus === 'media' ||
      (link.extractionStatus === 'ok' && (link.wordCount ?? 0) > 0)

    if (opensReader) useUiStore.getState().openReader(link.id)
    else void openExternal(link.url)

    if (link.isRead || link.isArchived) return
    if (!useSettingsStore.getState().reading.markReadOnOpen) return

    // Optimistic: reflect the read state immediately, then confirm server-side.
    // Dirty-tracking protects it from a stale realtime merge while in flight.
    markDirty(link.id, ['isRead'])
    set((current) => ({
      links: current.links.map((item) =>
        item.id === link.id ? { ...item, isRead: true } : item
      ),
      stats: { ...current.stats, unread: Math.max(0, current.stats.unread - 1) }
    }))

    void api.links.update(link.id, { isRead: true }).then(async (result) => {
      if (!result.ok) {
        clearDirty(link.id)
        reportError(result.error.message)
        await get().load()
        return
      }
      // Under the unread filter the card no longer matches; refresh the page.
      if (get().filter === 'unread') await get().load()
      clearDirty(link.id)
    })
  },

  createLink: async (input) => {
    const result = await api.links.create(input)
    if (result.ok) {
      reportSuccess('Link added')
      await get().load()
    } else {
      reportError(result.error.message)
    }
    return result
  },

  updateLink: async (id, patch) => {
    markDirty(id, Object.keys(patch) as Array<keyof Link>)
    const result = await api.links.update(id, patch)
    if (result.ok) {
      reportSuccess('Link updated')
      // Reload while the fields are still dirty so a response that started
      // before this write cannot overwrite it, then release the guard.
      await get().load()
    } else {
      reportError(result.error.message)
    }
    clearDirty(id)
    return result
  },

  deleteLink: async (id) => {
    const link = get().links.find((item) => item.id === id) ?? null
    const result = await settleIpc(() => api.links.delete(id))
    clearDirty(id)
    if (result.ok) {
      if (link) {
        set({ lastDeleted: [link], undoExpiresAt: Date.now() + UNDO_WINDOW_MS })
      }
      await get().load()
    } else {
      reportError(result.error.message)
    }
    return result
  },

  bulkUpdate: async (patch) => {
    const ids = get().selectedIds
    if (ids.length === 0) return ok(true as const)

    const fields = Object.keys(patch) as Array<keyof Link>
    for (const id of ids) markDirty(id, fields)

    const result = await api.links.bulkUpdate(ids, patch)
    if (result.ok) {
      reportSuccess(ids.length === 1 ? 'Link updated' : `${ids.length} links updated`)
      set({ selectedIds: [], selectionAnchorId: null })
      await get().load()
    } else {
      reportError(result.error.message)
    }
    for (const id of ids) clearDirty(id)
    return result
  },

  bulkDelete: async () => {
    const ids = get().selectedIds
    if (ids.length === 0) return ok(true as const)

    // Build a full snapshot of every selected row (not just the loaded page)
    // so Undo can restore exactly what was deleted, including "select all
    // matching" selections that reach beyond the current page.
    const loaded = new Map(get().links.map((link) => [link.id, link]))
    const missing = ids.filter((id) => !loaded.has(id))
    const snapshot: Link[] = []
    for (let index = 0; index < missing.length; index += SNAPSHOT_CHUNK_SIZE) {
      const result = await settleIpc(() =>
        api.links.getMany(missing.slice(index, index + SNAPSHOT_CHUNK_SIZE))
      )
      if (!result.ok) {
        reportError(result.error.message)
        return result
      }
      snapshot.push(...result.data)
    }
    for (const id of ids) {
      const link = loaded.get(id)
      if (link) snapshot.push(link)
    }

    const result = await settleIpc(() => api.links.bulkDelete(ids))
    if (result.ok) {
      set({
        selectedIds: [],
        selectionAnchorId: null,
        lastDeleted: snapshot,
        undoExpiresAt: snapshot.length > 0 ? Date.now() + UNDO_WINDOW_MS : null
      })
      await get().load()
    } else {
      reportError(result.error.message)
    }
    return result
  },

  clearLabel: async () => {
    const ids = get().selectedIds
    if (ids.length === 0) return ok(true as const)
    return get().bulkUpdate({ label: DEFAULT_LABEL })
  },

  markAllRead: async () => {
    const result = await api.links.markAllRead(buildQuery(get(), 0))
    if (result.ok) {
      if (result.data.updated > 0) {
        reportSuccess(`Marked ${result.data.updated} as read`)
        await get().load()
      }
    } else {
      reportError(result.error.message)
    }
    return result
  },

  refreshMetadata: async (id) => {
    const result = await api.links.refreshMetadata(id)
    if (result.ok) {
      reportSuccess('Metadata refreshed')
      await get().load()
    } else {
      reportError(result.error.message)
    }
    return result
  },

  undoDelete: async () => {
    const deleted = get().lastDeleted
    if (!deleted || deleted.length === 0) return

    const payload = deleted.map(toRestoreLinkInput)
    set({ undoExpiresAt: null })

    // The restore schema caps one request at 500 rows; undo snapshots can be
    // larger after "select all matching".
    let restored = 0
    for (let index = 0; index < payload.length; index += SNAPSHOT_CHUNK_SIZE) {
      const result = await api.links.restore(payload.slice(index, index + SNAPSHOT_CHUNK_SIZE))
      if (!result.ok) {
        // Keep the snapshot so a failed restore can be retried instead of
        // silently turning the delete permanent.
        reportError(result.error.message)
        set({ lastDeleted: deleted, undoExpiresAt: Date.now() + UNDO_WINDOW_MS })
        return
      }
      restored += result.data.restored
    }

    set({ lastDeleted: null })
    if (restored < payload.length) {
      const missing = payload.length - restored
      reportError(`Restored ${restored} of ${payload.length} links; ${missing} could not be restored.`)
    }
    await get().load()
  },

  dismissUndo: () => set({ lastDeleted: null, undoExpiresAt: null }),

  setRealtimeStatus: (realtimeStatus) => set({ realtimeStatus }),

  reset: () => {
    // Invalidate in-flight loads and drop edit guards so nothing from the
    // previous account can repopulate the store after sign-out.
    loadGeneration += 1
    dirtyFields.clear()
    set(initialLinksData)
  },

  toggleSelection: (id) =>
    set((state) => ({ selectionAnchorId: id, selectedIds: toggleId(state.selectedIds, id) })),

  selectRange: (id) =>
    set((state) => ({
      selectedIds: rangeSelection(
        state.links.map((link) => link.id),
        state.selectionAnchorId,
        id,
        state.selectedIds
      )
    })),

  clearSelection: () => set({ selectedIds: [], selectionAnchorId: null }),

  selectAllVisible: () =>
    set((state) => ({
      selectedIds: state.links.map((link) => link.id),
      selectionAnchorId: null
    })),

  selectAllMatching: async () => {
    const state = get()
    const generation = loadGeneration
    const ids: string[] = []
    let truncated = false
    for (let page = 0; page < SELECT_ALL_MAX_PAGES; page += 1) {
      const result = await api.links.list({
        ...buildQuery(state, page * SELECT_ALL_PAGE_SIZE),
        limit: SELECT_ALL_PAGE_SIZE
      })
      if (!result.ok) {
        // Abort instead of leaving a partial selection that looks complete.
        reportError(result.error.message)
        return
      }
      ids.push(...result.data.map((link) => link.id))
      if (result.data.length < SELECT_ALL_PAGE_SIZE) break
      if (page === SELECT_ALL_MAX_PAGES - 1) truncated = true
    }
    // The query changed while paging; the ids belong to the old filter.
    if (generation !== loadGeneration) return
    if (truncated) {
      reportError(`Selection limited to the first ${SELECT_ALL_MAX_PAGES * SELECT_ALL_PAGE_SIZE} matches.`)
    }
    set({ selectedIds: Array.from(new Set(ids)), selectionAnchorId: null })
  },

  createLabel: async (name) => {
    const result = await api.labels.create(name)
    if (result.ok) {
      reportSuccess('Label created')
      set({ labels: result.data })
    } else {
      reportError(result.error.message)
    }
    return result
  },

  renameLabel: async (oldName, newName) => {
    const result = await api.labels.rename(oldName, newName)
    if (result.ok) {
      reportSuccess('Label renamed')
      set({ labels: result.data })
      await get().load()
    } else {
      reportError(result.error.message)
    }
    return result
  },

  mergeLabel: async (source, target) => {
    const result = await api.labels.merge(source, target)
    if (result.ok) {
      reportSuccess('Labels merged')
      set({ labels: result.data })
      await get().load()
    } else {
      reportError(result.error.message)
    }
    return result
  },

  deleteLabel: async (name) => {
    const result = await api.labels.delete(name)
    if (result.ok) {
      reportSuccess('Label deleted')
      set({ labels: result.data })
      await get().load()
    } else {
      reportError(result.error.message)
    }
    return result
  },

  setLabelColor: async (name, color) => {
    const result = await api.labels.setColor(name, color)
    if (result.ok) set({ labelColors: result.data })
    else reportError(result.error.message)
    return result
  },

  refreshLabelColors: async () => {
    const result = await api.labels.getColors()
    if (result.ok) set({ labelColors: result.data })
    else reportError(result.error.message)
  }
}))
