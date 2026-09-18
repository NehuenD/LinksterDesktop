import Store from 'electron-store'
import type { XCaptureJob } from './x-capture-repository'
import {
  X_CAPTURE_SCHEMA_VERSION,
  XCaptureRepository,
  type XCapturePersistence,
  type XCaptureStoreAdapter
} from './x-capture-repository'

interface XCaptureFile {
  schemaVersion: number
  jobs: XCaptureJob[]
}

/**
 * electron-store adapter for the X capture queue. A dedicated file keeps the
 * queue independently migratable and out of the preferences store.
 */
export function createElectronXCaptureAdapter(): XCaptureStoreAdapter {
  let store: Store<XCaptureFile> | null = null

  // Lazy for the same reason as the outbox adapter: app.setPath('userData')
  // runs after module evaluation.
  const getStore = (): Store<XCaptureFile> => {
    store ??= new Store<XCaptureFile>({
      name: 'x-captures',
      defaults: { schemaVersion: X_CAPTURE_SCHEMA_VERSION, jobs: [] },
      migrations: {
        // Future schema upgrades branch here keyed on the stored version.
      }
    })
    return store
  }

  return {
    read: (): XCapturePersistence => {
      const current = getStore()
      return {
        schemaVersion: current.get('schemaVersion'),
        jobs: current.get('jobs')
      }
    },
    write: (data: XCapturePersistence): void => {
      const current = getStore()
      current.set('schemaVersion', data.schemaVersion)
      current.set('jobs', data.jobs)
    }
  }
}

export const xCaptureRepository = new XCaptureRepository(createElectronXCaptureAdapter())
