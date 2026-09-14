import Store from 'electron-store'
import type { ThemeMode } from '@shared/contract/ipc'
import type { StoredSecrets } from '../auth/session-storage'

export interface AppStoreSchema {
  themeMode: ThemeMode
  clipboardMonitoring: boolean
  notifyOnLinkCapture: boolean
  notifyOnScreenshot: boolean
  authSession?: StoredSecrets
}

export const store = new Store<AppStoreSchema>({
  name: 'linkster',
  defaults: {
    themeMode: 'system',
    clipboardMonitoring: true,
    notifyOnLinkCapture: true,
    notifyOnScreenshot: true
  }
})
