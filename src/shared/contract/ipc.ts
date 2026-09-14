import { z } from 'zod'

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
    bulkUpdate: 'links:bulk-update',
    bulkDelete: 'links:bulk-delete',
    refreshMetadata: 'links:refresh-metadata',
    changed: 'links:changed'
  },
  labels: {
    list: 'labels:list',
    create: 'labels:create',
    rename: 'labels:rename',
    merge: 'labels:merge',
    delete: 'labels:delete'
  },
  clipboard: {
    getStatus: 'clipboard:get-status',
    setMonitoring: 'clipboard:set-monitoring',
    captured: 'clipboard:captured'
  },
  settings: {
    getNotifications: 'settings:get-notifications',
    setNotifications: 'settings:set-notifications'
  },
  data: {
    export: 'data:export',
    copyAll: 'data:copy-all'
  },
  screenshots: {
    list: 'screenshots:list',
    getFolder: 'screenshots:get-folder',
    chooseFolder: 'screenshots:choose-folder',
    reveal: 'screenshots:reveal',
    copyPath: 'screenshots:copy-path',
    delete: 'screenshots:delete',
    changed: 'screenshots:changed'
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

export interface Link {
  id: string
  url: string
  title: string | null
  description: string | null
  thumbnailUrl: string | null
  label: string
  isRead: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string | null
  userId: string | null
}

export const LinkFilterSchema = z.enum(['all', 'unread', 'archived'])
export type LinkFilter = z.infer<typeof LinkFilterSchema>

export const LinkQuerySchema = z.object({
  filter: LinkFilterSchema.optional(),
  label: z.string().optional(),
  search: z.string().optional(),
  domain: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.number().int().positive().max(200).optional(),
  offset: z.number().int().nonnegative().optional()
})
export type LinkQuery = z.infer<typeof LinkQuerySchema>

export const DEFAULT_PAGE_SIZE = 48

export const CreateLinkInputSchema = z.object({
  url: z.string(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  label: z.string().nullable().optional()
})
export type CreateLinkInput = z.infer<typeof CreateLinkInputSchema>

export const UpdateLinkPatchSchema = z.object({
  url: z.string().optional(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  isRead: z.boolean().optional(),
  isArchived: z.boolean().optional()
})
export type UpdateLinkPatch = z.infer<typeof UpdateLinkPatchSchema>

export interface LinkStats {
  total: number
  unread: number
  archived: number
  byLabel: Record<string, number>
}

export interface LabelSummary {
  name: string
  count: number
}

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

export const ExportFormatSchema = z.enum(['json', 'csv'])
export type ExportFormat = z.infer<typeof ExportFormatSchema>

export interface ExportResult {
  path: string
  count: number
}

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

export interface LinksterApi {
  system: {
    ping(): Promise<IpcResult<PingResponse>>
    getAppInfo(): Promise<IpcResult<AppInfo>>
    getTheme(): Promise<IpcResult<ThemeMode>>
    setTheme(mode: ThemeMode): Promise<IpcResult<ThemeMode>>
    openExternal(url: string): Promise<IpcResult<true>>
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
    delete(id: string): Promise<IpcResult<true>>
    bulkUpdate(ids: string[], patch: UpdateLinkPatch): Promise<IpcResult<true>>
    bulkDelete(ids: string[]): Promise<IpcResult<true>>
    refreshMetadata(id: string): Promise<IpcResult<Link>>
    onChanged(listener: () => void): () => void
  }
  labels: {
    list(): Promise<IpcResult<string[]>>
    create(name: string): Promise<IpcResult<string[]>>
    rename(oldName: string, newName: string): Promise<IpcResult<string[]>>
    merge(source: string, target: string): Promise<IpcResult<string[]>>
    delete(name: string): Promise<IpcResult<string[]>>
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
  }
  data: {
    export(format: ExportFormat): Promise<IpcResult<ExportResult>>
    copyAll(): Promise<IpcResult<number>>
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
}
