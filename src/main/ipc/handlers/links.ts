import { secureHandle } from '../guard'
import {
  CreateLinkInputSchema,
  GetLinksByIdsSchema,
  IPC,
  LinkQuerySchema,
  MAX_BULK_LINK_IDS,
  QuickCaptureInputSchema,
  RestoreLinksInputSchema,
  UpdateLinkPatchSchema,
  fail,
  ok,
  type Link
} from '@shared/contract/ipc'
import { canonicalizeLinkUrl } from '@shared/lib/link-url'
import { parseXPostUrl } from '@shared/lib/x-url'
import {
  bulkDeleteLinks,
  bulkUpdateLinks,
  createLink,
  deleteLink,
  ensureLabel,
  getLinkById,
  getLinkStats,
  linkExists,
  listLinkKinds,
  listLinks,
  listLinksByIds,
  markAllRead,
  restoreLinks,
  updateLink,
  upsertLinkContent
} from '../../data/link-repository'
import { findXPostLinkIdByTweetId } from '../../data/x-post-repository'
import {
  discardPending,
  listPendingCaptures,
  quickCapture,
  retryPending
} from '../../services/capture-service'
import { fetchPageData } from '../../services/metadata-service'
import { readerService } from '../../services/reader-instance'
import { validateUrl } from '../../services/url-validator'
import { removeXCaptures, xCaptureService } from '../../services/x-capture-instance'

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Best-effort metadata fetch for manually added videos (no reader content). */
async function enrichYouTubeMetadata(link: Link): Promise<void> {
  try {
    const page = await fetchPageData(link.url)
    await updateLink(link.id, {
      title: page.metadata.title ?? link.title,
      description: page.metadata.description ?? link.description,
      thumbnailUrl: page.metadata.thumbnailUrl ?? link.thumbnailUrl,
      author: page.metadata.author ?? link.author,
      siteName: page.metadata.siteName ?? link.siteName,
      durationSeconds: page.metadata.durationSeconds ?? link.durationSeconds ?? null,
      channelUrl: page.metadata.channelUrl ?? link.channelUrl ?? null
    })
  } catch {
    // Best-effort; the section's Refresh action can retry.
  }
}

export function registerLinkHandlers(): void {
  secureHandle(IPC.links.list, async (_event, query: unknown) => {
    try {
      const parsed = LinkQuerySchema.parse(query ?? {})
      return ok(await listLinks(parsed))
    } catch (error) {
      return fail('LINKS_LIST_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.links.stats, async () => {
    try {
      return ok(await getLinkStats())
    } catch (error) {
      return fail('LINKS_STATS_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.links.create, async (_event, input: unknown) => {
    try {
      const parsed = CreateLinkInputSchema.parse(input)
      const validation = validateUrl(parsed.url)
      if (!validation.valid) return fail('INVALID_URL', validation.reason)

      // Manual adds share the capture path's dedupe rules: canonical URL plus
      // tweet id, so a mirror of an already-saved link is reported as duplicate.
      const canonical = canonicalizeLinkUrl(validation.url)
      const duplicate = await linkExists(canonical)
      if (duplicate) return fail('DUPLICATE_LINK', 'This link is already saved.')
      const xPost = parseXPostUrl(canonical)
      if (xPost && (await findXPostLinkIdByTweetId(xPost.tweetId))) {
        return fail('DUPLICATE_LINK', 'This X post is already saved.')
      }

      const label = await ensureLabel(parsed.label ?? 'General')
      const created = await createLink({ ...parsed, url: validation.url, label })
      // X posts got here through the manual Add dialog, not the outbox, so the
      // capture queue must be fed explicitly.
      if (created.kind === 'x-post') {
        xCaptureService.enqueue({ id: created.id, url: created.url })
      }
      // Manual adds skip the drain, so video metadata is fetched in the
      // background; the card fills in as soon as the fetch lands.
      if (created.kind === 'youtube') {
        void enrichYouTubeMetadata(created)
      }
      return ok(created)
    } catch (error) {
      return fail('LINKS_CREATE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.links.update, async (_event, id: unknown, patch: unknown) => {
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

      const before = await getLinkById(id)
      const updated = await updateLink(id, parsed)

      // A URL edit can move a link across the library/section boundary; keep
      // the section-specific artifacts (capture files, capture queue) in sync.
      if (updated.kind !== before?.kind) {
        if (updated.kind === 'x-post') {
          xCaptureService.enqueue({ id: updated.id, url: updated.url })
        }
        if (before?.kind === 'x-post') {
          removeXCaptures([id])
        }
      }

      return ok(updated)
    } catch (error) {
      return fail('LINKS_UPDATE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.links.delete, async (_event, id: unknown) => {
    try {
      if (typeof id !== 'string') return fail('INVALID_ID', 'A link id is required.')
      const link = await getLinkById(id)
      await deleteLink(id)
      if (link?.kind === 'x-post') removeXCaptures([id])
      // Drop the cached article body with the link (privacy + no zombie reads).
      readerService.removeContent(id)
      // Return the deleted row so isolated sections can offer a lossless undo
      // without a second round trip.
      return ok(link ?? null)
    } catch (error) {
      return fail('LINKS_DELETE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.links.getMany, async (_event, ids: unknown) => {
    try {
      const parsed = GetLinksByIdsSchema.parse(ids)
      return ok(await listLinksByIds(parsed))
    } catch (error) {
      return fail('LINKS_GET_MANY_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.links.bulkUpdate, async (_event, ids: unknown, patch: unknown) => {
    try {
      if (
        !Array.isArray(ids) ||
        ids.length === 0 ||
        ids.length > MAX_BULK_LINK_IDS ||
        ids.some((id) => typeof id !== 'string' || id.length === 0)
      ) {
        return fail('INVALID_IDS', 'An array of link ids is required.')
      }
      const parsed = UpdateLinkPatchSchema.parse(patch)
      // Bulk edits never change the URL in the UI; allowing it here would skip
      // the scheme validation and kind-transition side effects of links:update.
      if (parsed.url !== undefined) {
        return fail('INVALID_PATCH', 'URLs cannot be changed in bulk.')
      }
      if (parsed.label != null) await ensureLabel(parsed.label)
      await bulkUpdateLinks(ids as string[], parsed)
      return ok(true as const)
    } catch (error) {
      return fail('LINKS_BULK_UPDATE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.links.bulkDelete, async (_event, ids: unknown) => {
    try {
      if (
        !Array.isArray(ids) ||
        ids.length === 0 ||
        ids.length > MAX_BULK_LINK_IDS ||
        ids.some((id) => typeof id !== 'string' || id.length === 0)
      ) {
        return fail('INVALID_IDS', 'An array of link ids is required.')
      }
      const kinds = await listLinkKinds(ids as string[])
      await bulkDeleteLinks(ids as string[])
      removeXCaptures(kinds.filter((row) => row.kind === 'x-post').map((row) => row.id))
      for (const id of ids as string[]) readerService.removeContent(id)
      return ok(true as const)
    } catch (error) {
      return fail('LINKS_BULK_DELETE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.links.markAllRead, async (_event, query: unknown) => {
    try {
      const parsed = LinkQuerySchema.parse(query ?? {})
      return ok(await markAllRead(parsed))
    } catch (error) {
      return fail('LINKS_MARK_ALL_READ_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.links.restore, async (_event, links: unknown) => {
    try {
      const parsed = RestoreLinksInputSchema.parse(links)
      const valid = parsed.filter((record) => validateUrl(record.url).valid)
      const result = await restoreLinks(valid)
      return ok({
        ...result,
        requested: parsed.length,
        failed: result.failed + (parsed.length - valid.length)
      })
    } catch (error) {
      return fail('LINKS_RESTORE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.links.quickCreate, async (_event, input: unknown) => {
    try {
      const parsed = QuickCaptureInputSchema.parse(input)
      return ok(await quickCapture(parsed.url, { label: parsed.label, note: parsed.note ?? null }))
    } catch (error) {
      return fail('LINKS_QUICK_CREATE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.links.pendingList, () => {
    try {
      return ok(listPendingCaptures())
    } catch (error) {
      return fail('LINKS_PENDING_LIST_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.links.retryPending, async (_event, id: unknown) => {
    try {
      if (id !== undefined && typeof id !== 'string') {
        return fail('INVALID_ID', 'A pending id must be a string.')
      }
      return ok(await retryPending(id as string | undefined))
    } catch (error) {
      return fail('LINKS_RETRY_PENDING_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.links.discardPending, (_event, id: unknown) => {
    try {
      if (typeof id !== 'string') return fail('INVALID_ID', 'A pending id is required.')
      discardPending(id)
      return ok(true as const)
    } catch (error) {
      return fail('LINKS_DISCARD_PENDING_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.links.getContent, async (_event, id: unknown) => {
    try {
      if (typeof id !== 'string') return fail('INVALID_ID', 'A link id is required.')
      return ok(await readerService.getLinkContent(id))
    } catch (error) {
      return fail('LINKS_GET_CONTENT_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.links.refreshMetadata, async (_event, id: unknown) => {
    try {
      if (typeof id !== 'string') return fail('INVALID_ID', 'A link id is required.')

      const link = await getLinkById(id)
      if (!link) return fail('LINKS_NOT_FOUND', 'Link not found.')

      const page = await fetchPageData(link.url)
      await updateLink(id, {
        title: page.metadata.title ?? link.title,
        description: page.metadata.description ?? link.description,
        thumbnailUrl: page.metadata.thumbnailUrl ?? link.thumbnailUrl,
        author: page.metadata.author ?? link.author,
        siteName: page.metadata.siteName ?? link.siteName,
        durationSeconds: page.metadata.durationSeconds ?? link.durationSeconds ?? null,
        channelUrl: page.metadata.channelUrl ?? link.channelUrl ?? null
      })

      if (page.content) {
        const extractedAt = new Date().toISOString()
        try {
          await upsertLinkContent(id, page.content, extractedAt)
          readerService.cacheContent(
            id,
            {
              linkId: id,
              contentHtml: page.content.contentHtml,
              contentText: page.content.contentText,
              wordCount: page.content.wordCount,
              extractionStatus: page.content.status,
              extractedAt
            },
            link
          )
        } catch {
          // Reader content is derived; metadata refresh still succeeds.
        }
      } else if (!page.fetchFailed) {
        // The page is reachable but no longer contains an article (e.g. it
        // became a PDF/404): clear the stale body so the reader stops serving it.
        try {
          await upsertLinkContent(
            id,
            { contentHtml: null, contentText: null, wordCount: 0, status: 'unsupported' },
            new Date().toISOString()
          )
          readerService.removeContent(id)
        } catch {
          // Clearing stale content is best-effort.
        }
      }

      return ok((await getLinkById(id)) ?? link)
    } catch (error) {
      return fail('LINKS_REFRESH_FAILED', toMessage(error))
    }
  })
}
