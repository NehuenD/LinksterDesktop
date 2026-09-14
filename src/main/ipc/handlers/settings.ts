import { ipcMain } from 'electron'
import { IPC, NotificationPreferencesPatchSchema, fail, ok } from '@shared/contract/ipc'
import {
  getNotificationPreferences,
  setNotificationPreferences
} from '../../services/settings-service'

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.settings.getNotifications, () => ok(getNotificationPreferences()))

  ipcMain.handle(IPC.settings.setNotifications, (_event, patch: unknown) => {
    try {
      return ok(setNotificationPreferences(NotificationPreferencesPatchSchema.parse(patch)))
    } catch (error) {
      return fail('SETTINGS_UPDATE_FAILED', toMessage(error))
    }
  })
}
