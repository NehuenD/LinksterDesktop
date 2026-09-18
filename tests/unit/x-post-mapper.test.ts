import { describe, expect, it } from 'vitest'
import type { OutboxItem, XPost } from '@shared/contract/ipc'
import {
  mapXPostRow,
  shouldIncludePendingXPost,
  toPendingXPost
} from '../../src/main/services/x-post-mapper'
import type { XPostListRow } from '../../src/main/data/x-post-repository'

const ROW: XPostListRow = {
  link_id: 'link-1',
  url: 'https://x.com/jack/status/20',
  is_read: false,
  is_archived: false,
  created_at: '2026-09-17T09:00:00.000Z',
  tweet_id: '20',
  author_handle: 'jack',
  author_name: 'jack',
  text: 'just setting up my twttr',
  posted_at: '2006-03-21T00:00:00.000Z',
  capture_status: 'ok',
  capture_error: null,
  captured_at: '2026-09-17T09:00:05.000Z',
  related_url: 'https://example.com/story',
  related_link_id: 'link-2',
  related_title: 'A story',
  related_link_url: 'https://example.com/story',
  total: '3'
}

const OUTBOX_ITEM: OutboxItem = {
  id: 'outbox-1',
  url: 'https://x.com/jack/status/20',
  normalizedUrl: 'https://x.com/jack/status/20',
  label: 'General',
  note: null,
  ownerUserId: 'user-1',
  status: 'pending',
  attempts: 0,
  nextAttemptAt: null,
  lastError: null,
  createdAt: '2026-09-17T09:10:00.000Z',
  updatedAt: '2026-09-17T09:10:00.000Z'
}

describe('mapXPostRow', () => {
  it('maps a persisted row with capture state and related link', () => {
    expect(mapXPostRow(ROW, 'data:image/png;base64,abc')).toEqual({
      linkId: 'link-1',
      outboxId: null,
      url: 'https://x.com/jack/status/20',
      tweetId: '20',
      authorName: 'jack',
      authorHandle: 'jack',
      text: 'just setting up my twttr',
      postedAt: '2006-03-21T00:00:00.000Z',
      savedAt: '2026-09-17T09:00:00.000Z',
      isRead: false,
      isArchived: false,
      captureStatus: 'ok',
      captureError: null,
      capturedAt: '2026-09-17T09:00:05.000Z',
      thumbnailUrl: 'data:image/png;base64,abc',
      relatedUrl: 'https://example.com/story',
      relatedTitle: 'A story',
      relatedLinkId: 'link-2'
    })
  })

  it('maps the link archived state for the section badge', () => {
    expect(mapXPostRow({ ...ROW, is_archived: true }, null).isArchived).toBe(true)
  })

  it('defaults unknown capture states, missing tweet ids and missing dates', () => {
    const post = mapXPostRow(
      {
        ...ROW,
        tweet_id: null,
        capture_status: 'nonsense',
        created_at: null,
        capture_error: 'boom'
      },
      null
    )
    expect(post.tweetId).toBe('20')
    expect(post.captureStatus).toBe('none')
    expect(post.savedAt).toBeNull()
    expect(post.thumbnailUrl).toBeNull()
    expect(post.captureError).toBe('boom')
  })

  it('reports a locally queued capture as pending even when the row says none', () => {
    const post = mapXPostRow({ ...ROW, capture_status: 'none', capture_error: null }, null, true)

    expect(post.captureStatus).toBe('pending')
    expect(post.captureError).toBeNull()
  })
})

describe('toPendingXPost', () => {
  it('maps a queued outbox item to a pending X post card', () => {
    expect(toPendingXPost(OUTBOX_ITEM)).toEqual({
      linkId: null,
      outboxId: 'outbox-1',
      url: 'https://x.com/i/status/20',
      tweetId: '20',
      authorName: null,
      authorHandle: null,
      text: null,
      postedAt: null,
      savedAt: '2026-09-17T09:10:00.000Z',
      isRead: false,
      isArchived: false,
      captureStatus: 'pending',
      captureError: null,
      capturedAt: null,
      thumbnailUrl: null,
      relatedUrl: null,
      relatedTitle: null,
      relatedLinkId: null
    })
  })

  it('returns null for non-X outbox items', () => {
    expect(toPendingXPost({ ...OUTBOX_ITEM, url: 'https://example.com/a' })).toBeNull()
  })

  it('marks a failed outbox item as a failed capture with its error', () => {
    const post = toPendingXPost({
      ...OUTBOX_ITEM,
      status: 'failed',
      attempts: 3,
      lastError: { code: 'DRAIN_FAILED', message: 'Network unavailable' }
    })

    expect(post?.captureStatus).toBe('failed')
    expect(post?.captureError).toBe('Network unavailable')
  })
})

describe('shouldIncludePendingXPost', () => {
  const queued = toPendingXPost(OUTBOX_ITEM) as XPost
  const failed = toPendingXPost({
    ...OUTBOX_ITEM,
    status: 'failed',
    lastError: { code: 'DRAIN_FAILED', message: 'Network unavailable' }
  }) as XPost

  it('includes queued captures on the unfiltered first page', () => {
    expect(shouldIncludePendingXPost(queued, {})).toBe(true)
    expect(shouldIncludePendingXPost(queued, { filter: 'unread' })).toBe(true)
  })

  it('hides queued captures while searching, since they have no text yet', () => {
    expect(shouldIncludePendingXPost(queued, { search: 'hello' })).toBe(false)
  })

  it('hides queued captures under the archived and has-link filters', () => {
    expect(shouldIncludePendingXPost(queued, { filter: 'archived' })).toBe(false)
    expect(shouldIncludePendingXPost(queued, { filter: 'has-link' })).toBe(false)
  })

  it('shows only failed captures under the failed filter', () => {
    expect(shouldIncludePendingXPost(failed, { filter: 'failed' })).toBe(true)
    expect(shouldIncludePendingXPost(queued, { filter: 'failed' })).toBe(false)
  })
})
