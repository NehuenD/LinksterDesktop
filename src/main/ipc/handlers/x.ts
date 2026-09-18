import {
  IPC,
  XPostQuerySchema,
  fail,
  ok,
  type Link,
  type XPost,
  type XPostList
} from '@shared/contract/ipc'
import { getLinkById } from '../../data/link-repository'
import { outboxRepository } from '../../data/outbox-store'
import { listXPosts, resolveXRelatedLinks, updateXPostCaptureState } from '../../data/x-post-repository'
import {
  deleteXCapture,
  getXCaptureDataUrl,
  getXCaptureThumbnail,
  openXCapture,
  pruneXCaptureThumbnails,
  revealXCapture,
  xCaptureService
} from '../../services/x-capture-instance'
import { isCaptureCompleted } from '../../services/x-capture-service'
import { mapXPostRow, shouldIncludePendingXPost, toPendingXPost } from '../../services/x-post-mapper'
import { secureHandle } from '../guard'

const X_POST_PAGE_SIZE = 100

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function requireLinkId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** File-backed capture actions only apply to isolated X post links. */
async function findXPostLink(linkId: string): Promise<Link | null> {
  const link = await getLinkById(linkId)
  return link && link.kind === 'x-post' ? link : null
}

export function registerXHandlers(): void {
  secureHandle(IPC.x.list, async (_event, input: unknown) => {
    try {
      const query = XPostQuerySchema.parse(input ?? {})
      const start = query.offset ?? 0

      // Opportunistic: once a related URL has been captured, expose the link id.
      try {
        await resolveXRelatedLinks()
      } catch {
        // Relation resolution is best-effort; listing still succeeds.
      }

      const rows = await listXPosts(X_POST_PAGE_SIZE, query)
      // A queued local job means a capture is actively in progress; the DB row
      // only knows none/ok/failed, so merge the local queue in for the card.
      const queuedLinkIds = new Set(
        xCaptureService.repository
          .list()
          .filter((job) => job.status === 'pending')
          .map((job) => job.linkId)
      )
      const items: XPost[] = rows.map((row) =>
        mapXPostRow(row, getXCaptureThumbnail(row.link_id), queuedLinkIds.has(row.link_id))
      )
      if (start === 0) {
        pruneXCaptureThumbnails(new Set(rows.map((row) => row.link_id)))
      }

      const serverTotal = rows.length > 0 ? Number(rows[0].total ?? rows.length) : 0
      // Pending (not yet persisted) captures only exist on the first page, and
      // only when the active query can meaningfully match them.
      const pending =
        start === 0
          ? outboxRepository
              .list()
              .map(toPendingXPost)
              .filter((post): post is XPost => post !== null)
              .filter((post) => shouldIncludePendingXPost(post, query))
          : []

      const result: XPostList = {
        items: [...pending, ...items],
        total: serverTotal + pending.length,
        hasMore: start + rows.length < serverTotal
      }
      return ok(result)
    } catch (error) {
      return fail('X_LIST_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.x.retryCapture, async (_event, linkId: unknown) => {
    try {
      const id = requireLinkId(linkId)
      if (!id) return fail('INVALID_ID', 'A link id is required.')

      const link = await findXPostLink(id)
      if (!link) return fail('X_POST_NOT_FOUND', 'X post not found.')

      // A previously deleted/never-queued capture is re-enqueued, then retried.
      xCaptureService.enqueue({ id: link.id, url: link.url })
      const summary = await xCaptureService.retry(id)
      if (summary.processed === 0 && summary.failed > 0) {
        return fail(
          'X_CAPTURE_FAILED',
          'The capture could not be rendered. Check the post is still available and retry.'
        )
      }
      // A backoff requeue is not a completed capture; the renderer must not
      // report success until a PNG actually exists.
      return ok({ completed: isCaptureCompleted(summary) })
    } catch (error) {
      return fail('X_RETRY_CAPTURE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.x.revealCapture, async (_event, linkId: unknown) => {
    try {
      const id = requireLinkId(linkId)
      if (!id) return fail('INVALID_ID', 'A link id is required.')
      if (!(await findXPostLink(id))) return fail('X_POST_NOT_FOUND', 'X post not found.')
      await revealXCapture(id)
      return ok(true as const)
    } catch (error) {
      return fail('X_REVEAL_CAPTURE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.x.openCapture, async (_event, linkId: unknown) => {
    try {
      const id = requireLinkId(linkId)
      if (!id) return fail('INVALID_ID', 'A link id is required.')
      if (!(await findXPostLink(id))) return fail('X_POST_NOT_FOUND', 'X post not found.')
      await openXCapture(id)
      return ok(true as const)
    } catch (error) {
      return fail('X_OPEN_CAPTURE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.x.getCapture, async (_event, linkId: unknown) => {
    try {
      const id = requireLinkId(linkId)
      if (!id) return fail('INVALID_ID', 'A link id is required.')
      if (!(await findXPostLink(id))) return fail('X_POST_NOT_FOUND', 'X post not found.')
      const dataUrl = getXCaptureDataUrl(id)
      return ok(dataUrl ? { dataUrl } : null)
    } catch (error) {
      return fail('X_GET_CAPTURE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.x.deleteCapture, async (_event, linkId: unknown) => {
    try {
      const id = requireLinkId(linkId)
      if (!id) return fail('INVALID_ID', 'A link id is required.')
      if (!(await findXPostLink(id))) return fail('X_POST_NOT_FOUND', 'X post not found.')

      deleteXCapture(id)
      try {
        await updateXPostCaptureState(id, { status: 'none', error: null, capturedAt: null })
      } catch {
        // The PNG is gone locally; the state mirror is best-effort.
      }
      return ok(true as const)
    } catch (error) {
      return fail('X_DELETE_CAPTURE_FAILED', toMessage(error))
    }
  })
}
