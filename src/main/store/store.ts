import Store from 'electron-store'
import type { ThemeMode } from '@shared/contract/ipc'

export interface AppStoreSchema {
  themeMode: ThemeMode
}

export const store = new Store<AppStoreSchema>({
  name: 'linkster',
  defaults: {
    themeMode: 'system'
  }
})
