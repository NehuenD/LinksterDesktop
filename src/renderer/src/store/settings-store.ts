import { create } from 'zustand'
import { DEFAULT_QUICK_CAPTURE_ACCELERATOR } from '@shared/lib/hotkey'
import type {
  BackupResult,
  BackupSettings,
  BackupSettingsPatch,
  ExportFormat,
  ImportOptions,
  ImportPreview,
  ImportSummary,
  NotificationPermission,
  NotificationPreferences,
  NotificationPreferencesPatch,
  QuickCaptureSettings,
  QuickCaptureSettingsPatch,
  ReadingPreferences,
  ReadingPreferencesPatch,
  RestoreMode,
  RestorePreview,
  RestoreSummary
} from '@shared/contract/ipc'
import { api } from '../lib/api'
import { useLinksStore } from './links-store'
import { reportError, reportSuccess } from './toast-store'

interface SettingsStore {
  notifications: NotificationPreferences
  reading: ReadingPreferences
  notificationPermission: NotificationPermission
  quickCapture: QuickCaptureSettings
  backup: BackupSettings
  load: () => Promise<void>
  setNotifications: (patch: NotificationPreferencesPatch) => Promise<void>
  loadReading: () => Promise<void>
  setReading: (patch: ReadingPreferencesPatch) => Promise<void>
  loadNotificationPermission: () => Promise<void>
  requestNotificationPermission: () => Promise<void>
  loadQuickCapture: () => Promise<void>
  setQuickCapture: (patch: QuickCaptureSettingsPatch) => Promise<void>
  loadBackup: () => Promise<void>
  setBackup: (patch: BackupSettingsPatch) => Promise<void>
  pickBackupFolder: () => Promise<void>
  exportLinks: (format: ExportFormat) => Promise<void>
  copyAll: () => Promise<void>
  createBackup: (includeContent?: boolean) => Promise<BackupResult | null>
  pickImportFile: () => Promise<string | null>
  previewImport: (path: string) => Promise<ImportPreview | null>
  runImport: (path: string, options: ImportOptions) => Promise<ImportSummary | null>
  cancelImport: () => Promise<void>
  pickRestoreFile: () => Promise<string | null>
  previewRestore: (path: string) => Promise<RestorePreview | null>
  runRestore: (path: string, mode: RestoreMode) => Promise<RestoreSummary | null>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  notifications: { notifyOnLinkCapture: true, notifyOnScreenshot: true },
  reading: { markReadOnOpen: true },
  notificationPermission: 'granted',
  quickCapture: {
    enabled: true,
    accelerator: DEFAULT_QUICK_CAPTURE_ACCELERATOR,
    registered: true,
    error: null
  },
  backup: { enabled: false, folder: null, intervalDays: 7, retention: 5, lastBackupAt: null },

  load: async () => {
    const result = await api.settings.getNotifications()
    if (result.ok) set({ notifications: result.data })
  },

  setNotifications: async (patch) => {
    const result = await api.settings.setNotifications(patch)
    if (result.ok) set({ notifications: result.data })
    else reportError(result.error.message)
  },

  loadReading: async () => {
    const result = await api.settings.getReading()
    if (result.ok) set({ reading: result.data })
  },

  loadNotificationPermission: async () => {
    const result = await api.settings.getNotificationPermission()
    if (result.ok) set({ notificationPermission: result.data })
  },

  requestNotificationPermission: async () => {
    const result = await api.settings.requestNotificationPermission()
    if (result.ok) set({ notificationPermission: result.data })
    else reportError(result.error.message)
  },

  setReading: async (patch) => {
    const result = await api.settings.setReading(patch)
    if (result.ok) set({ reading: result.data })
    else reportError(result.error.message)
  },

  loadQuickCapture: async () => {
    const result = await api.settings.getQuickCapture()
    if (result.ok) set({ quickCapture: result.data })
  },

  setQuickCapture: async (patch) => {
    const result = await api.settings.setQuickCapture(patch)
    if (result.ok) set({ quickCapture: result.data })
    else reportError(result.error.message)
  },

  loadBackup: async () => {
    const result = await api.settings.getBackup()
    if (result.ok) set({ backup: result.data })
  },

  setBackup: async (patch) => {
    const result = await api.settings.setBackup(patch)
    if (result.ok) set({ backup: result.data })
    else reportError(result.error.message)
  },

  exportLinks: async (format) => {
    const result = await api.data.export(format)
    if (result.ok) {
      reportSuccess(`Exported ${result.data.count} links to ${result.data.path}`)
    } else {
      reportError(result.error.message)
    }
  },

  copyAll: async () => {
    const result = await api.data.copyAll()
    if (result.ok) reportSuccess(`Copied ${result.data} links to the clipboard`)
    else reportError(result.error.message)
  },

  createBackup: async (includeContent = true) => {
    // Manual backups honor the configured auto-backup folder.
    const result = await api.data.backupCreate({
      includeContent,
      targetDir: get().backup.folder ?? undefined
    })
    if (!result.ok) {
      reportError(result.error.message)
      return null
    }
    const { counts, path } = result.data
    reportSuccess(`Backed up ${counts.links} links and ${counts.contents} articles to ${path}`)
    const refreshed = await api.settings.getBackup()
    if (refreshed.ok) set({ backup: refreshed.data })
    return result.data
  },

  pickBackupFolder: async () => {
    const result = await api.data.backupPickFolder()
    if (!result.ok) {
      reportError(result.error.message)
      return
    }
    if (!result.data) return
    await get().setBackup({ folder: result.data.path })
  },

  pickImportFile: async () => {
    const result = await api.data.importPick()
    if (!result.ok) {
      reportError(result.error.message)
      return null
    }
    return result.data?.path ?? null
  },

  previewImport: async (path) => {
    const result = await api.data.importPreview(path)
    if (!result.ok) {
      reportError(result.error.message)
      return null
    }
    return result.data
  },

  runImport: async (path, options) => {
    const result = await api.data.importRun(path, options)
    if (!result.ok) {
      reportError(result.error.message)
      return null
    }
    // The library screen stays mounted while Settings is shown, so its data
    // must be refreshed explicitly (realtime may be reconnecting/offline).
    await useLinksStore.getState().load()
    await useLinksStore.getState().loadPending()
    return result.data
  },

  cancelImport: async () => {
    await api.data.importCancel()
  },

  pickRestoreFile: async () => {
    const result = await api.data.backupRestorePick()
    if (!result.ok) {
      reportError(result.error.message)
      return null
    }
    return result.data?.path ?? null
  },

  previewRestore: async (path) => {
    const result = await api.data.backupRestorePreview(path)
    if (!result.ok) {
      reportError(result.error.message)
      return null
    }
    return result.data
  },

  runRestore: async (path, mode) => {
    const result = await api.data.backupRestore(path, mode)
    if (!result.ok) {
      reportError(result.error.message)
      return null
    }
    // A replace-restore can change every link plus the persisted preferences.
    await useLinksStore.getState().load()
    await useLinksStore.getState().loadPending()
    await get().load()
    return result.data
  }
}))
