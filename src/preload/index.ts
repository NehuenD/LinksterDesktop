import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AppInfo,
  type AuthStateSnapshot,
  type BackupCreateOptions,
  type BackupResult,
  type BackupSettings,
  type BackupSettingsPatch,
  type ClipboardStatus,
  type DrainSummary,
  type ExportResult,
  type ImportOptions,
  type ImportPreview,
  type ImportProgress,
  type ImportSummary,
  type IpcResult,
  type LabelColors,
  type Link,
  type LinkStats,
  type LinksterApi,
  type MarkAllReadResult,
  type NotificationPermission,
  type RestoreLinkInput,
  type RestoreResult,
  type NotificationPreferences,
  type PendingCapture,
  type PingResponse,
  type QuickCaptureContext,
  type QuickCaptureInput,
  type QuickCaptureOutcome,
  type QuickCaptureSettings,
  type QuickCaptureSettingsPatch,
  type ReaderContent,
  type RealtimeStatus,
  type ReadingPreferences,
  type ReadingPreferencesPatch,
  type RestoreMode,
  type RestorePreview,
  type RestoreSummary,
  type Screenshot,
  type ScreenshotFolderInfo,
  type ThemeMode,
  type XPostList,
  type XRetryCaptureResult
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
    copyText: (text) => invoke<true>(IPC.system.copyText, text),
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
    delete: (id) => invoke<Link | null>(IPC.links.delete, id),
    getMany: (ids) => invoke<Link[]>(IPC.links.getMany, ids),
    bulkUpdate: (ids, patch) => invoke<true>(IPC.links.bulkUpdate, ids, patch),
    bulkDelete: (ids) => invoke<true>(IPC.links.bulkDelete, ids),
    markAllRead: (query) => invoke<MarkAllReadResult>(IPC.links.markAllRead, query),
    restore: (links: RestoreLinkInput[]) => invoke<RestoreResult>(IPC.links.restore, links),
    refreshMetadata: (id) => invoke<Link>(IPC.links.refreshMetadata, id),
    getContent: (id) => invoke<ReaderContent | null>(IPC.links.getContent, id),
    quickCreate: (input: QuickCaptureInput) =>
      invoke<QuickCaptureOutcome>(IPC.links.quickCreate, input),
    pendingList: () => invoke<PendingCapture[]>(IPC.links.pendingList),
    retryPending: (id) => invoke<DrainSummary>(IPC.links.retryPending, id),
    discardPending: (id) => invoke<true>(IPC.links.discardPending, id),
    onChanged: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on(IPC.links.changed, handler)
      return () => {
        ipcRenderer.removeListener(IPC.links.changed, handler)
      }
    },
    onPendingChanged: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on(IPC.links.pendingChanged, handler)
      return () => {
        ipcRenderer.removeListener(IPC.links.pendingChanged, handler)
      }
    }
  },
  labels: {
    list: () => invoke<string[]>(IPC.labels.list),
    create: (name) => invoke<string[]>(IPC.labels.create, name),
    rename: (oldName, newName) => invoke<string[]>(IPC.labels.rename, oldName, newName),
    merge: (source, target) => invoke<string[]>(IPC.labels.merge, source, target),
    delete: (name) => invoke<string[]>(IPC.labels.delete, name),
    getColors: () => invoke<LabelColors>(IPC.labels.getColors),
    setColor: (name, color) => invoke<LabelColors>(IPC.labels.setColor, name, color)
  },
  clipboard: {
    getStatus: () => invoke<ClipboardStatus>(IPC.clipboard.getStatus),
    setMonitoring: (monitoring) => invoke<boolean>(IPC.clipboard.setMonitoring, monitoring)
  },
  settings: {
    getNotifications: () => invoke<NotificationPreferences>(IPC.settings.getNotifications),
    setNotifications: (patch) =>
      invoke<NotificationPreferences>(IPC.settings.setNotifications, patch),
    getReading: () => invoke<ReadingPreferences>(IPC.settings.getReading),
    setReading: (patch: ReadingPreferencesPatch) =>
      invoke<ReadingPreferences>(IPC.settings.setReading, patch),
    getNotificationPermission: () =>
      invoke<NotificationPermission>(IPC.settings.getNotificationPermission),
    requestNotificationPermission: () =>
      invoke<NotificationPermission>(IPC.settings.requestNotificationPermission),
    getQuickCapture: () => invoke<QuickCaptureSettings>(IPC.settings.getQuickCapture),
    setQuickCapture: (patch: QuickCaptureSettingsPatch) =>
      invoke<QuickCaptureSettings>(IPC.settings.setQuickCapture, patch),
    getBackup: () => invoke<BackupSettings>(IPC.settings.getBackup),
    setBackup: (patch: BackupSettingsPatch) => invoke<BackupSettings>(IPC.settings.setBackup, patch)
  },
  data: {
    export: (format) => invoke<ExportResult>(IPC.data.export, format),
    copyAll: () => invoke<number>(IPC.data.copyAll),
    importPick: () => invoke<{ path: string } | null>(IPC.data.importPick),
    importPreview: (path) => invoke<ImportPreview>(IPC.data.importPreview, path),
    importRun: (path: string, options: ImportOptions) =>
      invoke<ImportSummary>(IPC.data.importRun, path, options),
    importCancel: () => invoke<true>(IPC.data.importCancel),
    onImportProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: ImportProgress): void => {
        listener(progress)
      }
      ipcRenderer.on(IPC.data.importProgress, handler)
      return () => {
        ipcRenderer.removeListener(IPC.data.importProgress, handler)
      }
    },
    backupCreate: (options?: BackupCreateOptions) =>
      invoke<BackupResult>(IPC.data.backupCreate, options ?? {}),
    backupPickFolder: () => invoke<{ path: string } | null>(IPC.data.backupPickFolder),
    backupRestorePick: () => invoke<{ path: string } | null>(IPC.data.backupRestorePick),
    backupRestorePreview: (path) => invoke<RestorePreview>(IPC.data.backupRestorePreview, path),
    backupRestore: (path: string, mode: RestoreMode) =>
      invoke<RestoreSummary>(IPC.data.backupRestore, path, mode)
  },
  screenshots: {
    list: () => invoke<Screenshot[]>(IPC.screenshots.list),
    getFolder: () => invoke<ScreenshotFolderInfo>(IPC.screenshots.getFolder),
    chooseFolder: () => invoke<ScreenshotFolderInfo>(IPC.screenshots.chooseFolder),
    reveal: (filePath) => invoke<true>(IPC.screenshots.reveal, filePath),
    copyPath: (filePath) => invoke<true>(IPC.screenshots.copyPath, filePath),
    delete: (filePath) => invoke<true>(IPC.screenshots.delete, filePath),
    onChanged: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on(IPC.screenshots.changed, handler)
      return () => {
        ipcRenderer.removeListener(IPC.screenshots.changed, handler)
      }
    }
  },
  x: {
    list: (query) => invoke<XPostList>(IPC.x.list, query),
    retryCapture: (linkId) => invoke<XRetryCaptureResult>(IPC.x.retryCapture, linkId),
    revealCapture: (linkId) => invoke<true>(IPC.x.revealCapture, linkId),
    openCapture: (linkId) => invoke<true>(IPC.x.openCapture, linkId),
    deleteCapture: (linkId) => invoke<true>(IPC.x.deleteCapture, linkId),
    getCapture: (linkId) => invoke<{ dataUrl: string } | null>(IPC.x.getCapture, linkId),
    onChanged: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on(IPC.x.changed, handler)
      return () => {
        ipcRenderer.removeListener(IPC.x.changed, handler)
      }
    }
  },
  quickCapture: {
    getContext: () => invoke<QuickCaptureContext>(IPC.quickCapture.getContext),
    hide: () => invoke<true>(IPC.quickCapture.hide),
    setDirty: (dirty) => invoke<true>(IPC.quickCapture.setDirty, dirty),
    onContext: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, context: QuickCaptureContext): void => {
        listener(context)
      }
      ipcRenderer.on(IPC.quickCapture.context, handler)
      return () => {
        ipcRenderer.removeListener(IPC.quickCapture.context, handler)
      }
    }
  },
  realtime: {
    getStatus: () => invoke<RealtimeStatus>(IPC.realtime.getStatus),
    onStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: RealtimeStatus): void => {
        listener(status)
      }
      ipcRenderer.on(IPC.realtime.status, handler)
      return () => {
        ipcRenderer.removeListener(IPC.realtime.status, handler)
      }
    }
  }
}

contextBridge.exposeInMainWorld('linkster', api)
