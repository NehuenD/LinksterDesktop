import { create } from 'zustand'
import type {
  ExportFormat,
  NotificationPreferences,
  NotificationPreferencesPatch
} from '@shared/contract/ipc'
import { api } from '../lib/api'
import { reportError, reportSuccess } from './toast-store'

interface SettingsStore {
  notifications: NotificationPreferences
  load: () => Promise<void>
  setNotifications: (patch: NotificationPreferencesPatch) => Promise<void>
  exportLinks: (format: ExportFormat) => Promise<void>
  copyAll: () => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  notifications: { notifyOnLinkCapture: true, notifyOnScreenshot: true },

  load: async () => {
    const result = await api.settings.getNotifications()
    if (result.ok) set({ notifications: result.data })
  },

  setNotifications: async (patch) => {
    const result = await api.settings.setNotifications(patch)
    if (result.ok) set({ notifications: result.data })
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
  }
}))
