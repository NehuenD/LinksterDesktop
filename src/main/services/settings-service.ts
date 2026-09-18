import { statSync } from 'node:fs'
import type {
  BackupSettings,
  BackupSettingsPatch,
  NotificationPreferences,
  NotificationPreferencesPatch,
  ReadingPreferences,
  ReadingPreferencesPatch
} from '@shared/contract/ipc'
import { store } from '../store/store'

export {
  applyQuickCaptureSettings as setQuickCaptureSettings,
  getQuickCaptureSettings
} from './hotkey-service'

export function getNotificationPreferences(): NotificationPreferences {
  return {
    notifyOnLinkCapture: store.get('notifyOnLinkCapture'),
    notifyOnScreenshot: store.get('notifyOnScreenshot')
  }
}

export function setNotificationPreferences(
  patch: NotificationPreferencesPatch
): NotificationPreferences {
  if (patch.notifyOnLinkCapture !== undefined) {
    store.set('notifyOnLinkCapture', patch.notifyOnLinkCapture)
  }
  if (patch.notifyOnScreenshot !== undefined) {
    store.set('notifyOnScreenshot', patch.notifyOnScreenshot)
  }
  return getNotificationPreferences()
}

export function getReadingPreferences(): ReadingPreferences {
  return { markReadOnOpen: store.get('markReadOnOpen') }
}

export function setReadingPreferences(patch: ReadingPreferencesPatch): ReadingPreferences {
  if (patch.markReadOnOpen !== undefined) {
    store.set('markReadOnOpen', patch.markReadOnOpen)
  }
  return getReadingPreferences()
}

export function getBackupSettings(): BackupSettings {
  return {
    enabled: store.get('backupEnabled'),
    folder: store.get('backupFolder') ?? null,
    intervalDays: store.get('backupIntervalDays'),
    retention: store.get('backupRetention'),
    lastBackupAt: store.get('lastBackupAt') ?? null
  }
}

export function setBackupSettings(patch: BackupSettingsPatch): BackupSettings {
  if (patch.enabled !== undefined) store.set('backupEnabled', patch.enabled)
  if (patch.folder !== undefined) {
    if (patch.folder) {
      // The scheduler writes here, so a non-directory path must be rejected
      // rather than persisted and failing later in the background.
      try {
        if (!statSync(patch.folder).isDirectory()) {
          throw new Error('not a directory')
        }
      } catch {
        throw new Error('The backup folder is not an accessible directory.')
      }
      store.set('backupFolder', patch.folder)
    } else {
      store.delete('backupFolder')
    }
  }
  if (patch.intervalDays !== undefined) store.set('backupIntervalDays', patch.intervalDays)
  if (patch.retention !== undefined) store.set('backupRetention', patch.retention)
  return getBackupSettings()
}
