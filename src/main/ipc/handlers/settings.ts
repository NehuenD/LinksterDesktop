import { secureHandle } from '../guard'
import {
  BackupSettingsPatchSchema,
  IPC,
  NotificationPreferencesPatchSchema,
  QuickCaptureSettingsPatchSchema,
  ReadingPreferencesPatchSchema,
  fail,
  ok
} from '@shared/contract/ipc'
import {
  getNotificationPermission,
  requestNotificationPermission
} from '../../services/notification-service'
import {
  getBackupSettings,
  getNotificationPreferences,
  getQuickCaptureSettings,
  getReadingPreferences,
  setBackupSettings,
  setNotificationPreferences,
  setQuickCaptureSettings,
  setReadingPreferences
} from '../../services/settings-service'

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerSettingsHandlers(): void {
  secureHandle(IPC.settings.getNotifications, () => ok(getNotificationPreferences()))

  secureHandle(IPC.settings.setNotifications, (_event, patch: unknown) => {
    try {
      return ok(setNotificationPreferences(NotificationPreferencesPatchSchema.parse(patch)))
    } catch (error) {
      return fail('SETTINGS_UPDATE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.settings.getNotificationPermission, () =>
    ok(getNotificationPermission())
  )

  secureHandle(IPC.settings.requestNotificationPermission, () =>
    ok(requestNotificationPermission())
  )

  secureHandle(IPC.settings.getReading, () => {
    try {
      return ok(getReadingPreferences())
    } catch (error) {
      return fail('SETTINGS_GET_READING_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.settings.setReading, (_event, patch: unknown) => {
    try {
      return ok(setReadingPreferences(ReadingPreferencesPatchSchema.parse(patch)))
    } catch (error) {
      return fail('SETTINGS_SET_READING_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.settings.getQuickCapture, () => {
    try {
      return ok(getQuickCaptureSettings())
    } catch (error) {
      return fail('SETTINGS_GET_QUICK_CAPTURE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.settings.setQuickCapture, (_event, patch: unknown) => {
    try {
      return ok(setQuickCaptureSettings(QuickCaptureSettingsPatchSchema.parse(patch)))
    } catch (error) {
      return fail('SETTINGS_SET_QUICK_CAPTURE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.settings.getBackup, () => {
    try {
      return ok(getBackupSettings())
    } catch (error) {
      return fail('SETTINGS_GET_BACKUP_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.settings.setBackup, (_event, patch: unknown) => {
    try {
      return ok(setBackupSettings(BackupSettingsPatchSchema.parse(patch)))
    } catch (error) {
      return fail('SETTINGS_SET_BACKUP_FAILED', toMessage(error))
    }
  })
}
