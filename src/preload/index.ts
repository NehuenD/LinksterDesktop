import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AppInfo,
  type AuthStateSnapshot,
  type ClipboardStatus,
  type IpcResult,
  type Link,
  type LinkStats,
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
    openExternal: (url) => invoke<true>(IPC.system.openExternal, url),
    minimize: () => invoke<true>(IPC.system.windowMinimize),
    toggleMaximize: () => invoke<boolean>(IPC.system.windowToggleMaximize),
    close: () => invoke<true>(IPC.system.windowClose)
  },
  auth: {
    getState: () => invoke<AuthStateSnapshot>(IPC.auth.getState),
    signInWithGoogle: () => invoke<true>(IPC.auth.signInWithGoogle),
    signOut: () => invoke<true>(IPC.auth.signOut),
    onChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: AuthStateSnapshot): void => {
        listener(state)
      }
      ipcRenderer.on(IPC.auth.changed, handler)
      return () => {
        ipcRenderer.removeListener(IPC.auth.changed, handler)
      }
    }
  },
  links: {
    list: (query) => invoke<Link[]>(IPC.links.list, query),
    stats: () => invoke<LinkStats>(IPC.links.stats),
    create: (input) => invoke<Link>(IPC.links.create, input),
    update: (id, patch) => invoke<Link>(IPC.links.update, id, patch),
    delete: (id) => invoke<true>(IPC.links.delete, id),
    refreshMetadata: (id) => invoke<Link>(IPC.links.refreshMetadata, id),
    onChanged: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on(IPC.links.changed, handler)
      return () => {
        ipcRenderer.removeListener(IPC.links.changed, handler)
      }
    }
  },
  labels: {
    list: () => invoke<string[]>(IPC.labels.list),
    create: (name) => invoke<string[]>(IPC.labels.create, name)
  },
  clipboard: {
    getStatus: () => invoke<ClipboardStatus>(IPC.clipboard.getStatus),
    setMonitoring: (monitoring) => invoke<boolean>(IPC.clipboard.setMonitoring, monitoring)
  }
}

contextBridge.exposeInMainWorld('linkster', api)
