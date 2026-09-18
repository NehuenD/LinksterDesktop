import { z } from 'zod'
import type { LabelColors } from '@shared/lib/label-color'

export type { LabelColors }

export const ThemeModeSchema = z.enum(['system', 'light', 'dark'])
export type ThemeMode = z.infer<typeof ThemeModeSchema>

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  arch: string
}

export interface PingResponse {
  pong: true
  ts: number
}

export interface AppError {
  code: string
  message: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: AppError }

export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

export function fail(code: string, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } }
}

export const IPC = {
  system: {
    ping: 'system:ping',
    getAppInfo: 'system:get-app-info',
    themeGet: 'system:theme-get',
    themeSet: 'system:theme-set',
    openExternal: 'system:open-external',
    copyText: 'system:copy-text',
    windowMinimize: 'system:window-minimize',
    windowToggleMaximize: 'system:window-toggle-maximize',
    windowClose: 'system:window-close'
  },
  auth: {
    getState: 'auth:get-state',
    signInWithGoogle: 'auth:sign-in-with-google',
    signOut: 'auth:sign-out',
    changed: 'auth:changed'
  },
  links: {
    list: 'links:list',
    stats: 'links:stats',
    create: 'links:create',
    update: 'links:update',
    delete: 'links:delete',
    getMany: 'links:get-many',
    bulkUpdate: 'links:bulk-update',
    bulkDelete: 'links:bulk-delete',
    markAllRead: 'links:mark-all-read',
    restore: 'links:restore',
    refreshMetadata: 'links:refresh-metadata',
    getContent: 'links:get-content',
    quickCreate: 'links:quick-create',
    pendingList: 'links:pending-list',
    retryPending: 'links:retry-pending',
    discardPending: 'links:discard-pending',
    changed: 'links:changed',
    pendingChanged: 'links:pending-changed'
  },
  labels: {
    list: 'labels:list',
    create: 'labels:create',
    rename: 'labels:rename',
    merge: 'labels:merge',
    delete: 'labels:delete',
    getColors: 'labels:get-colors',
    setColor: 'labels:set-color'
  },
  clipboard: {
    getStatus: 'clipboard:get-status',
    setMonitoring: 'clipboard:set-monitoring'
  },
  settings: {
    getNotifications: 'settings:get-notifications',
    setNotifications: 'settings:set-notifications',
    getReading: 'settings:get-reading',
    setReading: 'settings:set-reading',
    getNotificationPermission: 'settings:get-notification-permission',
    requestNotificationPermission: 'settings:request-notification-permission',
    getQuickCapture: 'settings:get-quick-capture',
    setQuickCapture: 'settings:set-quick-capture',
    getBackup: 'settings:get-backup',
    setBackup: 'settings:set-backup'
  },
  data: {
    export: 'data:export',
    copyAll: 'data:copy-all',
    importPick: 'data:import-pick',
    importPreview: 'data:import-preview',
    importRun: 'data:import-run',
    importCancel: 'data:import-cancel',
    importProgress: 'data:import-progress',
    backupCreate: 'data:backup-create',
    backupPickFolder: 'data:backup-pick-folder',
    backupRestorePick: 'data:backup-restore-pick',
    backupRestorePreview: 'data:backup-restore-preview',
    backupRestore: 'data:backup-restore'
  },
  screenshots: {
    list: 'screenshots:list',
    getFolder: 'screenshots:get-folder',
    chooseFolder: 'screenshots:choose-folder',
    reveal: 'screenshots:reveal',
    copyPath: 'screenshots:copy-path',
    delete: 'screenshots:delete',
    changed: 'screenshots:changed'
  },
  x: {
    list: 'x:list',
    retryCapture: 'x:retry-capture',
    revealCapture: 'x:reveal-capture',
    openCapture: 'x:open-capture',
    deleteCapture: 'x:delete-capture',
    getCapture: 'x:get-capture',
    changed: 'x:changed'
  },
  quickCapture: {
    getContext: 'quick-capture:get-context',
    hide: 'quick-capture:hide',
    setDirty: 'quick-capture:set-dirty',
    context: 'quick-capture:context'
  },
  realtime: {
    getStatus: 'realtime:get-status',
    status: 'realtime:status'
  }
} as const

export function createPingResponse(now: number = Date.now()): PingResponse {
  return { pong: true, ts: now }
}

export const AuthStatusSchema = z.enum([
  'initial',
  'loading',
  'authenticated',
  'unauthenticated',
  'error'
])
export type AuthStatus = z.infer<typeof AuthStatusSchema>

export interface AuthUser {
  id: string
  email: string | null
  name: string | null
  avatarUrl: string | null
}

export interface AuthStateSnapshot {
  status: AuthStatus
  user: AuthUser | null
  error: string | null
}

export const initialAuthState: AuthStateSnapshot = {
  status: 'initial',
  user: null,
  error: null
}

export const DEFAULT_LABEL = 'General'

/** What a saved link is: a regular page, an isolated X (Twitter) post or an isolated YouTube video. */
export const LinkKindSchema = z.enum(['link', 'x-post', 'youtube'])
export type LinkKind = z.infer<typeof LinkKindSchema>

/** Client-side query switch: a single kind or 'all' (used by isolation sections/handlers). */
export const LinkKindFilterSchema = z.enum(['link', 'x-post', 'youtube', 'all'])
export type LinkKindFilter = z.infer<typeof LinkKindFilterSchema>

/** Reader/classification state of a saved link. Doubles as the page kind in the reader. */
export const ExtractionStatusSchema = z.enum(['ok', 'media', 'empty', 'unsupported', 'failed', 'none'])
export type ExtractionStatus = z.infer<typeof ExtractionStatusSchema>

export interface Link {
  id: string
  url: string
  title: string | null
  description: string | null
  thumbnailUrl: string | null
  author: string | null
  siteName: string | null
  label: string
  kind: LinkKind
  isRead: boolean
  isArchived: boolean
  note: string | null
  createdAt: string
  updatedAt: string | null
  userId: string | null
  wordCount: number | null
  readingTimeMinutes: number | null
  extractionStatus: ExtractionStatus
  /** Present on search results: true when the match came from the article body. */
  matchedInContent?: boolean
  /** Video length in seconds (YouTube); optional so pre-migration rows still map. */
  durationSeconds?: number | null
  /** Channel/profile identity (YouTube microdata). */
  channelUrl?: string | null
  /** Video origin shape (shorts/live/music/…) captured for the section badge. */
  origin?: string | null
  /** Playlist context (`list=` param) preserved from the original URL. */
  playlistId?: string | null
}

/** Self-contained payload for the reader/media view; works offline once cached. */
export interface ReaderContent {
  linkId: string
  url: string
  title: string | null
  description: string | null
  thumbnailUrl: string | null
  siteName: string | null
  author: string | null
  note: string | null
  contentHtml: string | null
  contentText: string | null
  wordCount: number | null
  readingTimeMinutes: number | null
  extractionStatus: ExtractionStatus
  extractedAt: string | null
  fromCache: boolean
}

export const LinkFilterSchema = z.enum(['all', 'unread', 'archived'])
export type LinkFilter = z.infer<typeof LinkFilterSchema>

export const LinkSortSchema = z.enum(['newest', 'oldest', 'title', 'domain'])
export type LinkSort = z.infer<typeof LinkSortSchema>

export const LinkQuerySchema = z.object({
  filter: LinkFilterSchema.optional(),
  label: z.string().optional(),
  search: z.string().optional(),
  domain: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  searchContent: z.boolean().optional(),
  kind: LinkKindFilterSchema.optional(),
  sort: LinkSortSchema.optional(),
  limit: z.number().int().positive().max(200).optional(),
  offset: z.number().int().nonnegative().optional()
})
export type LinkQuery = z.infer<typeof LinkQuerySchema>

export const DEFAULT_PAGE_SIZE = 48

export const CreateLinkInputSchema = z.object({
  url: z.string().max(2000),
  title: z.string().max(500).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  thumbnailUrl: z.string().max(2000).nullable().optional(),
  author: z.string().max(500).nullable().optional(),
  siteName: z.string().max(500).nullable().optional(),
  label: z.string().max(100).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
  channelUrl: z.string().max(2000).nullable().optional()
})
export type CreateLinkInput = z.infer<typeof CreateLinkInputSchema>

export const UpdateLinkPatchSchema = z.object({
  url: z.string().max(2000).optional(),
  title: z.string().max(500).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  thumbnailUrl: z.string().max(2000).nullable().optional(),
  author: z.string().max(500).nullable().optional(),
  siteName: z.string().max(500).nullable().optional(),
  label: z.string().max(100).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  isRead: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
  channelUrl: z.string().max(2000).nullable().optional()
})
export type UpdateLinkPatch = z.infer<typeof UpdateLinkPatchSchema>

/** Bulk actions cap the id list so a huge array cannot build a giant query. */
export const MAX_BULK_LINK_IDS = 10_000

/**
 * Full snapshot of a deleted link, used to restore it with its original id and
 * timestamps instead of re-creating a new row. Undo sends these back verbatim.
 */
export const RestoreLinkInputSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  siteName: z.string().nullable().optional(),
  label: z.string(),
  note: z.string().max(2000).nullable().optional(),
  isRead: z.boolean(),
  isArchived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string().nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
  channelUrl: z.string().nullable().optional()
})
export type RestoreLinkInput = z.infer<typeof RestoreLinkInputSchema>

export const RestoreLinksInputSchema = z.array(RestoreLinkInputSchema).min(1).max(500)

/** Undo snapshots read rows back before a bulk delete. */
export const GetLinksByIdsSchema = z.array(z.string().min(1)).min(1).max(500)

export interface RestoreResult {
  requested: number
  restored: number
  /** Skipped because a row with the same unique URL already exists. */
  skipped: number
  failed: number
}

export interface MarkAllReadResult {
  updated: number
}

export interface LinkStats {
  total: number
  unread: number
  archived: number
  byLabel: Record<string, number>
  /** Links of kind `x-post`; drives the X section's sidebar count. */
  xPosts: number
  /** Links of kind `youtube`; drives the YouTube section's sidebar count. */
  youtube: number
  /** Unread, unarchived X posts; drives the sidebar queue badge. */
  xPostsUnread: number
  /** Unread, unarchived videos; drives the sidebar queue badge. */
  youtubeUnwatched: number
}

/** Supabase realtime channel connection state, surfaced to the renderer. */
export type RealtimeStatus =
  | 'INITIAL'
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR'

/** Local-only sync state of a captured URL that has not yet been persisted server-side. */
export type OutboxStatus = 'pending' | 'failed'

export interface OutboxError {
  code: string
  message: string
}

/**
 * A durable, locally persisted capture entry. Written before metadata fetch / DB
 * insert so a capture is never lost; removed once the link is persisted.
 */
export interface OutboxItem {
  id: string
  url: string
  normalizedUrl: string
  label: string
  note: string | null
  /**
   * Supabase user that enqueued the capture. Items are never drained into a
   * different account; legacy/unowned items (null) are discarded on drain.
   */
  ownerUserId: string | null
  status: OutboxStatus
  attempts: number
  nextAttemptAt: number | null
  lastError: OutboxError | null
  createdAt: string
  updatedAt: string
}

/** Renderer-facing projection of an unsynced capture. */
export interface PendingCapture {
  id: string
  url: string
  label: string
  status: OutboxStatus
  attempts: number
  lastError: OutboxError | null
  createdAt: string
}

export interface DrainSummary {
  synced: number
  failed: number
  retried: number
}

export interface LabelSummary {
  name: string
  count: number
}

/** A 6-digit hex color chosen for a label. */
export const LabelColorSchema = z.string().regex(/^#[0-9A-F]{6}$/i)

export interface ClipboardStatus {
  monitoring: boolean
  intervalMs: number
  native: boolean
}

export interface NotificationPreferences {
  notifyOnLinkCapture: boolean
  notifyOnScreenshot: boolean
}

export const NotificationPreferencesPatchSchema = z.object({
  notifyOnLinkCapture: z.boolean().optional(),
  notifyOnScreenshot: z.boolean().optional()
})
export type NotificationPreferencesPatch = z.infer<typeof NotificationPreferencesPatchSchema>

export interface ReadingPreferences {
  /** Mark a link read when it is opened (unless the link is archived). */
  markReadOnOpen: boolean
}

/**
 * OS notification availability. Electron exposes no permission query, so this
 * reports `granted` when the platform supports notifications at all (the first
 * notification raises the OS prompt on macOS) and `unsupported` otherwise.
 */
export type NotificationPermission = 'granted' | 'unsupported'

export const ReadingPreferencesPatchSchema = z.object({
  markReadOnOpen: z.boolean().optional()
})
export type ReadingPreferencesPatch = z.infer<typeof ReadingPreferencesPatchSchema>

export const ExportFormatSchema = z.enum(['json', 'csv'])
export type ExportFormat = z.infer<typeof ExportFormatSchema>

export interface ExportResult {
  path: string
  count: number
}

/** Where an import's rows came from. `auto` lets the main process sniff the file. */
export const ImportSourceSchema = z.enum([
  'bookmarks-html',
  'pocket',
  'instapaper',
  'raindrop',
  'linkster-backup'
])
export type ImportSource = z.infer<typeof ImportSourceSchema>

/** Common intermediate shape every source parser maps onto. */
export interface ImportRecord {
  url: string
  title: string | null
  label: string
  isRead: boolean
  isArchived: boolean
  createdAt: string | null
  source: ImportSource
}

export interface ImportOptions {
  source: ImportSource | 'auto'
  defaultLabel?: string
  /** Skip records whose normalized URL already exists (default true). */
  skipDuplicates?: boolean
}

export const ImportOptionsSchema = z.object({
  source: z.union([ImportSourceSchema, z.literal('auto')]).default('auto'),
  defaultLabel: z.string().optional(),
  skipDuplicates: z.boolean().optional()
})

export interface ImportPreview {
  source: ImportSource
  path: string
  total: number
  duplicates: number
  invalid: number
  sample: Array<Pick<ImportRecord, 'title' | 'url' | 'label'>>
}

export interface ImportProgress {
  phase: 'parsing' | 'writing' | 'done'
  processed: number
  total: number
  added: number
  skipped: number
  failed: number
}

export interface ImportSummary extends ImportProgress {
  source: ImportSource
  duplicates: number
  invalid: number
  cancelled: boolean
}

export interface BackupManifest {
  app: 'linkster'
  formatVersion: number
  createdAt: string
  appVersion: string
  counts: { links: number; labels: number; contents: number }
}

/** Non-secret settings embedded in a backup. Credentials are never included. */
export interface BackupPreferences {
  themeMode: ThemeMode
  clipboardMonitoring: boolean
  notifyOnLinkCapture: boolean
  notifyOnScreenshot: boolean
  quickCaptureEnabled: boolean
  quickCaptureHotkey: string
}

export interface BackupResult {
  path: string
  counts: { links: number; labels: number; contents: number }
  bytes: number
}

export interface RestorePreview {
  path: string
  manifest: BackupManifest
  newLinks: number
  conflicts: number
}

export const RestoreModeSchema = z.enum(['merge', 'replace'])
export type RestoreMode = z.infer<typeof RestoreModeSchema>

export interface RestoreSummary {
  mode: RestoreMode
  total: number
  added: number
  skipped: number
  conflicted: number
  /** Rows that could not be restored (DB/validation errors); 0 on success. */
  failed: number
  labels: number
  contents: number
}

/** Scheduler-facing auto-backup configuration. */
export interface BackupSettings {
  enabled: boolean
  folder: string | null
  intervalDays: number
  retention: number
  lastBackupAt: string | null
}

export const BackupSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  folder: z.string().nullable().optional(),
  intervalDays: z.number().int().min(1).max(365).optional(),
  retention: z.number().int().min(1).max(100).optional()
})
export type BackupSettingsPatch = z.infer<typeof BackupSettingsPatchSchema>

export const BackupCreateOptionsSchema = z.object({
  includeContent: z.boolean().optional(),
  targetDir: z.string().max(1000).optional()
})
export type BackupCreateOptions = z.infer<typeof BackupCreateOptionsSchema>

export interface Screenshot {
  id: string
  filePath: string
  fileName: string
  capturedAt: string
  thumbnailUrl: string | null
}

export interface ScreenshotFolderInfo {
  folder: string | null
  detected: string | null
}

/** Local capture state of an X post: none = not attempted, pending = queued, ok = PNG on disk, failed = terminal. */
export const XCaptureStatusSchema = z.enum(['none', 'pending', 'ok', 'failed'])
export type XCaptureStatus = z.infer<typeof XCaptureStatusSchema>

/** One row of the X section: a persisted post, or a queued capture that has no link yet. */
export interface XPost {
  /** Library link id; null while the capture is still queued in the outbox. */
  linkId: string | null
  /** Outbox id for a queued (not yet persisted) capture. */
  outboxId: string | null
  url: string
  tweetId: string
  authorName: string | null
  authorHandle: string | null
  text: string | null
  postedAt: string | null
  savedAt: string | null
  isRead: boolean
  isArchived: boolean
  captureStatus: XCaptureStatus
  captureError: string | null
  capturedAt: string | null
  /** Data URL of the local capture thumbnail; null when no PNG exists. */
  thumbnailUrl: string | null
  relatedUrl: string | null
  relatedTitle: string | null
  relatedLinkId: string | null
}

export interface XPostList {
  items: XPost[]
  total: number
  hasMore: boolean
}

export const XPostFilterSchema = z.enum(['all', 'unread', 'archived', 'has-link', 'failed'])
export type XPostFilter = z.infer<typeof XPostFilterSchema>

export const XPostSortSchema = z.enum(['newest', 'oldest', 'author'])
export type XPostSort = z.infer<typeof XPostSortSchema>

/** Section toolbar query: server-side search, filter and sort for X posts. */
export const XPostQuerySchema = z.object({
  search: z.string().optional(),
  filter: XPostFilterSchema.optional(),
  sort: XPostSortSchema.optional(),
  offset: z.number().int().nonnegative().optional()
})
export type XPostQuery = z.infer<typeof XPostQuerySchema>

/** Outcome of a manual X capture retry: `completed` is true only when a capture finished. */
export interface XRetryCaptureResult {
  completed: boolean
}

/** Context pushed to the quick-capture overlay every time it is shown. */
export interface QuickCaptureContext {
  clipboardUrl: string | null
  defaultLabel: string
}

export interface QuickCaptureInput {
  url: string
  label?: string
  note?: string | null
}

export const QuickCaptureInputSchema = z.object({
  url: z.string(),
  label: z.string().optional(),
  note: z.string().max(2000).nullable().optional()
})

/** Result surfaced by the overlay after a quick capture attempt. */
export type QuickCaptureOutcome =
  | { outcome: 'saved'; label: string }
  | { outcome: 'queued'; label: string }
  | { outcome: 'pending'; message: string }
  | { outcome: 'duplicate'; message: string }
  | { outcome: 'invalid'; message: string }

/** Registration state of the global quick-capture shortcut. */
export interface QuickCaptureSettings {
  enabled: boolean
  accelerator: string
  registered: boolean
  error: string | null
}

export const QuickCaptureSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  accelerator: z.string().optional()
})
export type QuickCaptureSettingsPatch = z.infer<typeof QuickCaptureSettingsPatchSchema>

export interface LinksterApi {
  system: {
    ping(): Promise<IpcResult<PingResponse>>
    getAppInfo(): Promise<IpcResult<AppInfo>>
    getTheme(): Promise<IpcResult<ThemeMode>>
    setTheme(mode: ThemeMode): Promise<IpcResult<ThemeMode>>
    openExternal(url: string): Promise<IpcResult<true>>
    copyText(text: string): Promise<IpcResult<true>>
    minimize(): Promise<IpcResult<true>>
    toggleMaximize(): Promise<IpcResult<boolean>>
    close(): Promise<IpcResult<true>>
  }
  auth: {
    getState(): Promise<IpcResult<AuthStateSnapshot>>
    signInWithGoogle(): Promise<IpcResult<true>>
    signOut(): Promise<IpcResult<true>>
    onChanged(listener: (state: AuthStateSnapshot) => void): () => void
  }
  links: {
    list(query: LinkQuery): Promise<IpcResult<Link[]>>
    stats(): Promise<IpcResult<LinkStats>>
    create(input: CreateLinkInput): Promise<IpcResult<Link>>
    update(id: string, patch: UpdateLinkPatch): Promise<IpcResult<Link>>
    delete(id: string): Promise<IpcResult<Link | null>>
    getMany(ids: string[]): Promise<IpcResult<Link[]>>
    bulkUpdate(ids: string[], patch: UpdateLinkPatch): Promise<IpcResult<true>>
    bulkDelete(ids: string[]): Promise<IpcResult<true>>
    markAllRead(query: LinkQuery): Promise<IpcResult<MarkAllReadResult>>
    restore(links: RestoreLinkInput[]): Promise<IpcResult<RestoreResult>>
    refreshMetadata(id: string): Promise<IpcResult<Link>>
    getContent(id: string): Promise<IpcResult<ReaderContent | null>>
    quickCreate(input: QuickCaptureInput): Promise<IpcResult<QuickCaptureOutcome>>
    pendingList(): Promise<IpcResult<PendingCapture[]>>
    retryPending(id?: string): Promise<IpcResult<DrainSummary>>
    discardPending(id: string): Promise<IpcResult<true>>
    onChanged(listener: () => void): () => void
    onPendingChanged(listener: () => void): () => void
  }
  labels: {
    list(): Promise<IpcResult<string[]>>
    create(name: string): Promise<IpcResult<string[]>>
    rename(oldName: string, newName: string): Promise<IpcResult<string[]>>
    merge(source: string, target: string): Promise<IpcResult<string[]>>
    delete(name: string): Promise<IpcResult<string[]>>
    getColors(): Promise<IpcResult<LabelColors>>
    setColor(name: string, color: string | null): Promise<IpcResult<LabelColors>>
  }
  clipboard: {
    getStatus(): Promise<IpcResult<ClipboardStatus>>
    setMonitoring(monitoring: boolean): Promise<IpcResult<boolean>>
  }
  settings: {
    getNotifications(): Promise<IpcResult<NotificationPreferences>>
    setNotifications(
      patch: NotificationPreferencesPatch
    ): Promise<IpcResult<NotificationPreferences>>
    getReading(): Promise<IpcResult<ReadingPreferences>>
    setReading(patch: ReadingPreferencesPatch): Promise<IpcResult<ReadingPreferences>>
    getNotificationPermission(): Promise<IpcResult<NotificationPermission>>
    requestNotificationPermission(): Promise<IpcResult<NotificationPermission>>
    getQuickCapture(): Promise<IpcResult<QuickCaptureSettings>>
    setQuickCapture(
      patch: QuickCaptureSettingsPatch
    ): Promise<IpcResult<QuickCaptureSettings>>
    getBackup(): Promise<IpcResult<BackupSettings>>
    setBackup(patch: BackupSettingsPatch): Promise<IpcResult<BackupSettings>>
  }
  data: {
    export(format: ExportFormat): Promise<IpcResult<ExportResult>>
    copyAll(): Promise<IpcResult<number>>
    importPick(): Promise<IpcResult<{ path: string } | null>>
    importPreview(path: string): Promise<IpcResult<ImportPreview>>
    importRun(path: string, options: ImportOptions): Promise<IpcResult<ImportSummary>>
    importCancel(): Promise<IpcResult<true>>
    onImportProgress(listener: (progress: ImportProgress) => void): () => void
    backupCreate(options?: BackupCreateOptions): Promise<IpcResult<BackupResult>>
    backupPickFolder(): Promise<IpcResult<{ path: string } | null>>
    backupRestorePick(): Promise<IpcResult<{ path: string } | null>>
    backupRestorePreview(path: string): Promise<IpcResult<RestorePreview>>
    backupRestore(path: string, mode: RestoreMode): Promise<IpcResult<RestoreSummary>>
  }
  screenshots: {
    list(): Promise<IpcResult<Screenshot[]>>
    getFolder(): Promise<IpcResult<ScreenshotFolderInfo>>
    chooseFolder(): Promise<IpcResult<ScreenshotFolderInfo>>
    reveal(filePath: string): Promise<IpcResult<true>>
    copyPath(filePath: string): Promise<IpcResult<true>>
    delete(filePath: string): Promise<IpcResult<true>>
    onChanged(listener: () => void): () => void
  }
  x: {
    list(query?: XPostQuery): Promise<IpcResult<XPostList>>
    retryCapture(linkId: string): Promise<IpcResult<XRetryCaptureResult>>
    revealCapture(linkId: string): Promise<IpcResult<true>>
    openCapture(linkId: string): Promise<IpcResult<true>>
    deleteCapture(linkId: string): Promise<IpcResult<true>>
    getCapture(linkId: string): Promise<IpcResult<{ dataUrl: string } | null>>
    onChanged(listener: () => void): () => void
  }
  quickCapture: {
    getContext(): Promise<IpcResult<QuickCaptureContext>>
    hide(): Promise<IpcResult<true>>
    setDirty(dirty: boolean): Promise<IpcResult<true>>
    onContext(listener: (context: QuickCaptureContext) => void): () => void
  }
  realtime: {
    getStatus(): Promise<IpcResult<RealtimeStatus>>
    onStatus(listener: (status: RealtimeStatus) => void): () => void
  }
}
