import Store from 'electron-store'
import { DEFAULT_QUICK_CAPTURE_ACCELERATOR } from '@shared/lib/hotkey'
import type { LabelColors, ThemeMode } from '@shared/contract/ipc'
import type { StoredSecrets } from '../auth/session-storage'

export interface AppStoreSchema {
  themeMode: ThemeMode
  clipboardMonitoring: boolean
  notifyOnLinkCapture: boolean
  notifyOnScreenshot: boolean
  markReadOnOpen: boolean
  quickCaptureEnabled: boolean
  quickCaptureHotkey: string
  screenshotFolder?: string
  authSession?: StoredSecrets
  labelColors: LabelColors
  backupEnabled: boolean
  backupFolder?: string
  backupIntervalDays: number
  backupRetention: number
  lastBackupAt?: string
}

export const store = new Store<AppStoreSchema>({
  name: 'linkster',
  defaults: {
    themeMode: 'system',
    clipboardMonitoring: true,
    notifyOnLinkCapture: true,
    notifyOnScreenshot: true,
    markReadOnOpen: true,
    quickCaptureEnabled: true,
    quickCaptureHotkey: DEFAULT_QUICK_CAPTURE_ACCELERATOR,
    labelColors: {},
    backupEnabled: false,
    backupIntervalDays: 7,
    backupRetention: 5
  }
})
