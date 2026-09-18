import { describe, expect, it } from 'vitest'
import type { Link } from '@shared/contract/ipc'
import { toRestoreLinkInput } from '../../src/shared/lib/link-restore'

const LINK: Link = {
  id: 'link-1',
  url: 'https://x.com/jack/status/20',
  title: 'hello',
  description: 'world',
  thumbnailUrl: null,
  author: 'jack',
  siteName: 'X',
  label: 'X',
  kind: 'x-post',
  isRead: true,
  isArchived: true,
  note: 'keep me',
  createdAt: '2026-09-17T09:00:00.000Z',
  updatedAt: '2026-09-17T09:05:00.000Z',
  userId: 'user-1',
  wordCount: null,
  readingTimeMinutes: null,
  extractionStatus: 'none',
  durationSeconds: 213,
  channelUrl: 'https://www.youtube.com/@a'
}

describe('toRestoreLinkInput', () => {
  it('preserves identity, label/note and read/archive state for undo', () => {
    expect(toRestoreLinkInput(LINK)).toEqual({
      id: 'link-1',
      url: 'https://x.com/jack/status/20',
      title: 'hello',
      description: 'world',
      thumbnailUrl: null,
      author: 'jack',
      siteName: 'X',
      label: 'X',
      note: 'keep me',
      isRead: true,
      isArchived: true,
      createdAt: '2026-09-17T09:00:00.000Z',
      updatedAt: '2026-09-17T09:05:00.000Z',
      durationSeconds: 213,
      channelUrl: 'https://www.youtube.com/@a'
    })
  })
})
