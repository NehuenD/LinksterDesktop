import Store from 'electron-store'
import type { OutboxItem } from '@shared/contract/ipc'
import {
  OUTBOX_SCHEMA_VERSION,
  OutboxRepository,
  type OutboxPersistence,
  type OutboxStoreAdapter
} from './outbox-repository'

interface OutboxFile {
  schemaVersion: number
  items: OutboxItem[]
}

/**
 * electron-store adapter for the capture outbox. A dedicated file keeps the
 * outbox independently migratable and avoids rewriting preferences on enqueue.
 */
export function createElectronOutboxAdapter(): OutboxStoreAdapter {
  let store: Store<OutboxFile> | null = null

  // electron-store captures app.getPath('userData') on first construction, so
  // the store must not be created at import time: main/index.ts applies
  // LINKSTER_USER_DATA_DIR (and app.setPath) after modules are evaluated.
  const getStore = (): Store<OutboxFile> => {
    store ??= new Store<OutboxFile>({
      name: 'outbox',
      defaults: { schemaVersion: OUTBOX_SCHEMA_VERSION, items: [] },
      migrations: {
        // Future schema upgrades branch here keyed on the stored version.
      }
    })
    return store
  }

  return {
    read: (): OutboxPersistence => {
      const current = getStore()
      return {
        schemaVersion: current.get('schemaVersion'),
        items: current.get('items')
      }
    },
    write: (data: OutboxPersistence): void => {
      const current = getStore()
      current.set('schemaVersion', data.schemaVersion)
      current.set('items', data.items)
    }
  }
}

export const outboxRepository = new OutboxRepository(createElectronOutboxAdapter())
