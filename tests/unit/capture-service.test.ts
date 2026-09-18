import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutboxItem } from '@shared/contract/ipc'

const repo = vi.hoisted(() => ({
  linkExists: vi.fn(),
  createLink: vi.fn(),
  ensureLabel: vi.fn(),
  upsertLinkContent: vi.fn(),
  isUniqueViolation: vi.fn(() => false)
}))

const xPosts = vi.hoisted(() => ({
  findXPostLinkIdByTweetId: vi.fn<() => Promise<string | null>>(async () => null)
}))

const outbox = vi.hoisted(() => ({
  findByNormalizedUrl: vi.fn(() => null),
  enqueue: vi.fn(),
  get: vi.fn(() => null),
  listDue: vi.fn(() => [] as OutboxItem[]),
  list: vi.fn(() => [] as OutboxItem[]),
  markAttempt: vi.fn(),
  markFailed: vi.fn(),
  remove: vi.fn(),
  requeue: vi.fn(),
  purgeOwner: vi.fn(() => 0)
}))

const fetchPageData = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  Notification: class {
    static isSupported(): boolean {
      return false
    }
    show(): void {}
  }
}))

vi.mock('../../src/main/auth/auth-state', () => ({
  getAuthState: () => ({
    status: 'authenticated',
    user: { id: 'user-1', email: null, name: null, avatarUrl: null },
    error: null
  })
}))

vi.mock('../../src/main/data/link-repository', () => repo)
vi.mock('../../src/main/data/x-post-repository', () => xPosts)
vi.mock('../../src/main/data/outbox-store', () => ({ outboxRepository: outbox }))
vi.mock('../../src/main/services/metadata-service', () => ({ fetchPageData }))
vi.mock('../../src/main/services/realtime-service', () => ({ isRealtimeActive: () => false }))
vi.mock('../../src/main/services/reader-instance', () => ({
  readerService: { cacheContent: vi.fn(), removeContent: vi.fn(), getLinkContent: vi.fn() }
}))
vi.mock('../../src/main/store/store', () => ({ store: { get: () => false } }))

import {
  drainOutbox,
  prepareCapture,
  setLinkPersistedHook
} from '../../src/main/services/capture-service'

function outboxItem(overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id: 'job-1',
    url: 'https://x.com/jack/status/20',
    normalizedUrl: 'https://x.com/jack/status/20',
    label: 'General',
    note: null,
    ownerUserId: 'user-1',
    status: 'pending',
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('prepareCapture canonicalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setLinkPersistedHook(null)
  })

  it('rewrites X mirrors to the canonical URL before dedupe and enqueue', async () => {
    outbox.findByNormalizedUrl.mockReturnValue(null)
    repo.linkExists.mockResolvedValue(false)
    outbox.enqueue.mockReturnValue({
      item: outboxItem(),
      created: true
    })

    const result = await prepareCapture('https://twitter.com/jack/status/20?s=20')

    expect(outbox.findByNormalizedUrl).toHaveBeenCalledWith('https://x.com/i/status/20', 'user-1')
    expect(repo.linkExists).toHaveBeenCalledWith('https://x.com/i/status/20')
    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://x.com/i/status/20',
        normalizedUrl: 'https://x.com/i/status/20'
      })
    )
    expect(result).toMatchObject({ accepted: true })
  })

  it('rejects a mirror of an already-captured tweet by tweet id', async () => {
    outbox.findByNormalizedUrl.mockReturnValue(null)
    repo.linkExists.mockResolvedValue(false)
    xPosts.findXPostLinkIdByTweetId.mockResolvedValueOnce('legacy-link-id')

    const result = await prepareCapture('https://x.com/jack/status/20')

    expect(result).toMatchObject({ accepted: false, code: 'duplicate' })
    expect(outbox.enqueue).not.toHaveBeenCalled()
  })

  it('leaves non-X URLs untouched', async () => {
    outbox.findByNormalizedUrl.mockReturnValue(null)
    repo.linkExists.mockResolvedValue(false)
    outbox.enqueue.mockReturnValue({ item: outboxItem(), created: true })

    await prepareCapture('https://example.com/article')

    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/article',
        normalizedUrl: 'https://example.com/article'
      })
    )
  })

  it('canonicalizes YouTube variants before dedupe and enqueue', async () => {
    outbox.findByNormalizedUrl.mockReturnValue(null)
    repo.linkExists.mockResolvedValue(false)
    outbox.enqueue.mockReturnValue({ item: outboxItem(), created: true })

    await prepareCapture('https://youtu.be/dQw4w9WgXcQ?si=abc')

    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        normalizedUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      })
    )
  })
})

describe('drain pass kind handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setLinkPersistedHook(null)
    repo.ensureLabel.mockResolvedValue('General')
  })

  it('skips the HTML fetch for X posts and fires the hook with the kind', async () => {
    const hook = vi.fn()
    setLinkPersistedHook(hook)
    outbox.listDue.mockReturnValue([outboxItem()])
    repo.createLink.mockResolvedValue({
      id: 'link-1',
      url: 'https://x.com/i/status/20',
      title: null
    })

    await drainOutbox()

    expect(fetchPageData).not.toHaveBeenCalled()
    expect(repo.createLink).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://x.com/jack/status/20',
        siteName: 'X',
        label: 'General'
      })
    )
    expect(hook).toHaveBeenCalledWith({
      id: 'link-1',
      url: 'https://x.com/jack/status/20',
      kind: 'x-post'
    })
    expect(outbox.remove).toHaveBeenCalledWith('job-1')
    setLinkPersistedHook(null)
  })

  it('drops an outbox item whose tweet is already persisted under another URL', async () => {
    const hook = vi.fn()
    setLinkPersistedHook(hook)
    outbox.listDue.mockReturnValue([outboxItem()])
    xPosts.findXPostLinkIdByTweetId.mockResolvedValueOnce('existing-link-id')

    await drainOutbox()

    expect(repo.createLink).not.toHaveBeenCalled()
    expect(fetchPageData).not.toHaveBeenCalled()
    expect(outbox.remove).toHaveBeenCalledWith('job-1')
    setLinkPersistedHook(null)
  })

  it('still fetches metadata for regular links and reports kind link', async () => {
    const hook = vi.fn()
    setLinkPersistedHook(hook)
    outbox.listDue.mockReturnValue([
      outboxItem({ id: 'job-2', url: 'https://example.com/a', normalizedUrl: 'https://example.com/a' })
    ])
    fetchPageData.mockResolvedValue({
      metadata: {
        title: 'Example',
        description: null,
        thumbnailUrl: null,
        author: null,
        siteName: 'Example',
        ogType: null
      },
      finalUrl: 'https://example.com/a',
      content: null
    })
    repo.createLink.mockResolvedValue({ id: 'link-2', url: 'https://example.com/a', title: 'Example' })

    await drainOutbox()

    expect(fetchPageData).toHaveBeenCalledWith('https://example.com/a')
    expect(hook).toHaveBeenCalledWith({
      id: 'link-2',
      url: 'https://example.com/a',
      kind: 'link'
    })
    setLinkPersistedHook(null)
  })

  it('fetches metadata for YouTube videos and reports kind youtube', async () => {
    const hook = vi.fn()
    setLinkPersistedHook(hook)
    outbox.listDue.mockReturnValue([
      outboxItem({
        id: 'job-3',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        normalizedUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      })
    ])
    fetchPageData.mockResolvedValue({
      metadata: {
        title: 'A video',
        description: null,
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        author: 'A channel',
        siteName: 'YouTube',
        ogType: 'video.other'
      },
      finalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      content: null
    })
    repo.createLink.mockResolvedValue({
      id: 'link-3',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'A video'
    })

    await drainOutbox()

    expect(fetchPageData).toHaveBeenCalledWith('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(hook).toHaveBeenCalledWith({
      id: 'link-3',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      kind: 'youtube'
    })
    setLinkPersistedHook(null)
  })
})
