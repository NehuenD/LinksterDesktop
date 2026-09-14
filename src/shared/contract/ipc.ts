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
    windowMinimize: 'system:window-minimize',
    windowToggleMaximize: 'system:window-toggle-maximize',
    windowClose: 'system:window-close'
  }
} as const

export function createPingResponse(now: number = Date.now()): PingResponse {
  return { pong: true, ts: now }
}

export interface LinksterApi {
  system: {
    ping(): Promise<IpcResult<PingResponse>>
    getAppInfo(): Promise<IpcResult<AppInfo>>
    getTheme(): Promise<IpcResult<ThemeMode>>
    setTheme(mode: ThemeMode): Promise<IpcResult<ThemeMode>>
    minimize(): Promise<IpcResult<true>>
    toggleMaximize(): Promise<IpcResult<boolean>>
    close(): Promise<IpcResult<true>>
  }
}
