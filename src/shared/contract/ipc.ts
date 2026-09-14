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
    refreshMetadata: 'links:refresh-metadata',
    changed: 'links:changed'
  },
  labels: {
    list: 'labels:list',
    create: 'labels:create'
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
  search: z.string().optional()
})
export type LinkQuery = z.infer<typeof LinkQuerySchema>

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
    refreshMetadata(id: string): Promise<IpcResult<Link>>
  }
  labels: {
    list(): Promise<IpcResult<string[]>>
    create(name: string): Promise<IpcResult<string[]>>
  }
}
