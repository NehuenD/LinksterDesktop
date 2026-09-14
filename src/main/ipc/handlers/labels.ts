import { ipcMain } from 'electron'
import { IPC, fail, ok } from '@shared/contract/ipc'
import { listLabels } from '../../data/label-repository'

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerLabelHandlers(): void {
  ipcMain.handle(IPC.labels.list, async () => {
    try {
      return ok(await listLabels())
    } catch (error) {
      return fail('LABELS_LIST_FAILED', toMessage(error))
    }
  })
}
