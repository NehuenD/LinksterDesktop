import { ipcMain } from 'electron'
import { IPC, fail, ok } from '@shared/contract/ipc'
import { createLabel, listLabels } from '../../data/label-repository'

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

  ipcMain.handle(IPC.labels.create, async (_event, name: unknown) => {
    try {
      if (typeof name !== 'string') return fail('INVALID_NAME', 'A label name is required.')
      return ok(await createLabel(name))
    } catch (error) {
      return fail('LABELS_CREATE_FAILED', toMessage(error))
    }
  })
}
