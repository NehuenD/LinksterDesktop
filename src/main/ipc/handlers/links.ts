import { ipcMain } from 'electron'
import { IPC, LinkQuerySchema, fail, ok } from '@shared/contract/ipc'
import { getLinkStats, listLinks } from '../../data/link-repository'

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerLinkHandlers(): void {
  ipcMain.handle(IPC.links.list, async (_event, query: unknown) => {
    try {
      const parsed = LinkQuerySchema.parse(query ?? {})
      return ok(await listLinks(parsed))
    } catch (error) {
      return fail('LINKS_LIST_FAILED', toMessage(error))
    }
  })

  ipcMain.handle(IPC.links.stats, async () => {
    try {
      return ok(await getLinkStats())
    } catch (error) {
      return fail('LINKS_STATS_FAILED', toMessage(error))
    }
  })
}
