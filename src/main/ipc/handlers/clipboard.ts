import { ipcMain } from 'electron'
import { IPC, fail, ok } from '@shared/contract/ipc'
import {
  isMonitoring,
  pollingIntervalMs,
  setMonitoring
} from '../../services/clipboard-controller'

export function registerClipboardHandlers(): void {
  ipcMain.handle(IPC.clipboard.getStatus, () =>
    ok({ monitoring: isMonitoring(), intervalMs: pollingIntervalMs() })
  )

  ipcMain.handle(IPC.clipboard.setMonitoring, (_event, value: unknown) => {
    if (typeof value !== 'boolean') {
      return fail('INVALID_ARGUMENT', 'Monitoring must be a boolean.')
    }
    return ok(setMonitoring(value))
  })
}
