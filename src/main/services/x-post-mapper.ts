import {
  XCaptureStatusSchema,
  type OutboxItem,
  type XCaptureStatus,
  type XPost,
  type XPostQuery
} from '@shared/contract/ipc'
import { parseXPostUrl } from '@shared/lib/x-url'
import type { XPostListRow } from '../data/x-post-repository'

function parseCaptureStatus(value: string | null | undefined): XCaptureStatus {
  const parsed = XCaptureStatusSchema.safeParse(value)
  return parsed.success ? parsed.data : 'none'
}

function parseDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Maps an `x_post_list` RPC row to the renderer contract. */
export function mapXPostRow(
  row: XPostListRow,
  thumbnailUrl: string | null,
  hasQueuedCapture = false
): XPost {
  return {
    linkId: row.link_id,
    outboxId: null,
    url: row.url,
    tweetId: row.tweet_id ?? parseXPostUrl(row.url)?.tweetId ?? '',
    authorName: row.author_name,
    authorHandle: row.author_handle,
    text: row.text,
    postedAt: parseDate(row.posted_at),
    savedAt: parseDate(row.created_at),
    isRead: row.is_read === true,
    isArchived: row.is_archived === true,
    captureStatus: hasQueuedCapture ? 'pending' : parseCaptureStatus(row.capture_status),
    captureError: hasQueuedCapture ? null : row.capture_error,
    capturedAt: parseDate(row.captured_at),
    thumbnailUrl,
    relatedUrl: row.related_url,
    relatedTitle: row.related_title,
    relatedLinkId: row.related_link_id
  }
}

/** Maps a queued outbox item to the X section's pending card shape. */
export function toPendingXPost(item: OutboxItem): XPost | null {
  const parsed = parseXPostUrl(item.url)
  if (!parsed) return null

  return {
    linkId: null,
    outboxId: item.id,
    url: parsed.canonicalUrl,
    tweetId: parsed.tweetId,
    authorName: null,
    authorHandle: null,
    text: null,
    postedAt: null,
    savedAt: item.createdAt,
    isRead: false,
    isArchived: false,
    captureStatus: item.status === 'failed' ? 'failed' : 'pending',
    captureError: item.lastError?.message ?? null,
    capturedAt: null,
    thumbnailUrl: null,
    relatedUrl: null,
    relatedTitle: null,
    relatedLinkId: null
  }
}

/**
 * Whether a queued (not yet persisted) capture belongs in the filtered list:
 * it has no text/author to match a search, is never archived and has no related
 * link, but a failed outbox item is a valid match for the failed filter.
 */
export function shouldIncludePendingXPost(
  post: XPost,
  query: Pick<XPostQuery, 'search' | 'filter'>
): boolean {
  if (query.search?.trim()) return false

  switch (query.filter) {
    case 'archived':
    case 'has-link':
      return false
    case 'failed':
      return post.captureStatus === 'failed'
    default:
      return true
  }
}
