import { ipcMain } from 'electron'
import {
  CreateLinkInputSchema,
  IPC,
  LinkQuerySchema,
  UpdateLinkPatchSchema,
  fail,
  ok
} from '@shared/contract/ipc'
import {
  bulkDeleteLinks,
  bulkUpdateLinks,
  createLink,
  deleteLink,
  ensureLabel,
  getLinkById,
  getLinkStats,
  listLinks,
  updateLink
} from '../../data/link-repository'
import { fetchMetadata } from '../../services/metadata-service'
import { validateUrl } from '../../services/url-validator'

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

  ipcMain.handle(IPC.links.create, async (_event, input: unknown) => {
    try {
      const parsed = CreateLinkInputSchema.parse(input)
      const validation = validateUrl(parsed.url)
      if (!validation.valid) return fail('INVALID_URL', validation.reason)

      const label = await ensureLabel(parsed.label ?? 'General')
      return ok(await createLink({ ...parsed, url: validation.url, label }))
    } catch (error) {
      return fail('LINKS_CREATE_FAILED', toMessage(error))
    }
  })

  ipcMain.handle(IPC.links.update, async (_event, id: unknown, patch: unknown) => {
    try {
      if (typeof id !== 'string') return fail('INVALID_ID', 'A link id is required.')

      const parsed = UpdateLinkPatchSchema.parse(patch)
      if (parsed.url !== undefined) {
        const validation = validateUrl(parsed.url)
        if (!validation.valid) return fail('INVALID_URL', validation.reason)
        parsed.url = validation.url
      }
      if (parsed.label != null) {
        await ensureLabel(parsed.label)
      }

      return ok(await updateLink(id, parsed))
    } catch (error) {
      return fail('LINKS_UPDATE_FAILED', toMessage(error))
    }
  })

  ipcMain.handle(IPC.links.delete, async (_event, id: unknown) => {
    try {
      if (typeof id !== 'string') return fail('INVALID_ID', 'A link id is required.')
      await deleteLink(id)
      return ok(true as const)
    } catch (error) {
      return fail('LINKS_DELETE_FAILED', toMessage(error))
    }
  })

  ipcMain.handle(IPC.links.bulkUpdate, async (_event, ids: unknown, patch: unknown) => {
    try {
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
        return fail('INVALID_IDS', 'An array of link ids is required.')
      }
      const parsed = UpdateLinkPatchSchema.parse(patch)
      if (parsed.label != null) await ensureLabel(parsed.label)
      await bulkUpdateLinks(ids as string[], parsed)
      return ok(true as const)
    } catch (error) {
      return fail('LINKS_BULK_UPDATE_FAILED', toMessage(error))
    }
  })

  ipcMain.handle(IPC.links.bulkDelete, async (_event, ids: unknown) => {
    try {
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
        return fail('INVALID_IDS', 'An array of link ids is required.')
      }
      await bulkDeleteLinks(ids as string[])
      return ok(true as const)
    } catch (error) {
      return fail('LINKS_BULK_DELETE_FAILED', toMessage(error))
    }
  })

  ipcMain.handle(IPC.links.refreshMetadata, async (_event, id: unknown) => {
    try {
      if (typeof id !== 'string') return fail('INVALID_ID', 'A link id is required.')

      const link = await getLinkById(id)
      if (!link) return fail('LINKS_NOT_FOUND', 'Link not found.')

      const metadata = await fetchMetadata(link.url)
      return ok(
        await updateLink(id, {
          title: metadata.title ?? link.title,
          description: metadata.description ?? link.description,
          thumbnailUrl: metadata.thumbnailUrl ?? link.thumbnailUrl
        })
      )
    } catch (error) {
      return fail('LINKS_REFRESH_FAILED', toMessage(error))
    }
  })
}
