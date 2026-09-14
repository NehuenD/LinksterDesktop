import { ipcMain } from 'electron'
import { ExportFormatSchema, IPC, fail, ok } from '@shared/contract/ipc'
import { copyAllLinks, exportLinks } from '../../services/data-export-service'

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerDataHandlers(): void {
  ipcMain.handle(IPC.data.export, async (_event, format: unknown) => {
    try {
      const parsed = ExportFormatSchema.parse(format)
      return ok(await exportLinks(parsed))
    } catch (error) {
      return fail('EXPORT_FAILED', toMessage(error))
    }
  })

  ipcMain.handle(IPC.data.copyAll, async () => {
    try {
      return ok(await copyAllLinks())
    } catch (error) {
      return fail('COPY_FAILED', toMessage(error))
    }
  })
}
