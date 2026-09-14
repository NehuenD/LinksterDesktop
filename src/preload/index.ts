import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AppInfo,
  type IpcResult,
  type LinksterApi,
  type PingResponse,
  type ThemeMode
} from '@shared/contract/ipc'

function invoke<T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResult<T>>
}

const api: LinksterApi = {
  system: {
    ping: () => invoke<PingResponse>(IPC.system.ping),
    getAppInfo: () => invoke<AppInfo>(IPC.system.getAppInfo),
    getTheme: () => invoke<ThemeMode>(IPC.system.themeGet),
    setTheme: (mode) => invoke<ThemeMode>(IPC.system.themeSet, mode),
    minimize: () => invoke<true>(IPC.system.windowMinimize),
    toggleMaximize: () => invoke<boolean>(IPC.system.windowToggleMaximize),
    close: () => invoke<true>(IPC.system.windowClose)
  }
}

contextBridge.exposeInMainWorld('linkster', api)
