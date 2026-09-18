import { describe, expect, it, vi } from 'vitest'
import { DatabaseError } from '../../src/main/data/db-error'
import {
  X_CAPTURE_SCHEMA_VERSION,
  XCaptureRepository,
  type XCapturePersistence,
  type XCaptureStoreAdapter
} from '../../src/main/data/x-capture-repository'
import type { XPostData } from '../../src/main/services/x-embed'
import {
  createXCaptureService,
  isCaptureCompleted,
  MAX_X_CAPTURE_ATTEMPTS,
  toLinkEnrichment
} from '../../src/main/services/x-capture-service'

function memoryStore(): XCaptureStoreAdapter & { data: XCapturePersistence } {
  const data: XCapturePersistence = { schemaVersion: X_CAPTURE_SCHEMA_VERSION, jobs: [] }
  return {
    data,
    read: () => structuredClone(data),
    write: (next) => {
      data.jobs = structuredClone(next.jobs)
    }
  }
}

const NOW = new Date('2026-09-17T10:00:00.000Z').getTime()

function makeService() {
  const store = memoryStore()
  const repository = new XCaptureRepository(store, () => NOW)
  const deps = {
    repository,
    fetchOEmbed: vi.fn<(tweetId: string) => Promise<XPostData | null>>(),
    renderCapture: vi.fn<(tweetId: string, post: XPostData | null) => Promise<Buffer>>(),
    writeCapture: vi.fn<(linkId: string, png: Buffer) => void>(),
    expandLink: vi.fn<(url: string) => Promise<string | null>>(),
    enqueueRelatedLink: vi.fn<(url: string, label: string) => Promise<void>>(),
    upsertMetadata: vi.fn().mockResolvedValue(undefined),
    ensurePostRow: vi.fn().mockResolvedValue(undefined),
    updateCaptureState: vi.fn().mockResolvedValue(undefined),
    enrichLink: vi.fn().mockResolvedValue(undefined),
    now: () => NOW,
    notifyChanged: vi.fn(),
    notifyCapture: vi.fn()
  }
  deps.renderCapture.mockResolvedValue(Buffer.from('fake-png'))
  return { service: createXCaptureService(deps), deps, repository }
}

const POST: XPostData = {
  tweetId: '20',
  authorName: 'jack',
  authorHandle: 'jack',
  text: 'just setting up my twttr',
  html: '<blockquote class="twitter-tweet"><p>just setting up my twttr</p></blockquote>',
  postedAt: '2006-03-21T00:00:00.000Z'
}

const LINK_POST: XPostData = {
  ...POST,
  html: '<blockquote class="twitter-tweet"><p>Read about it here: <a href="https://t.co/K8SnbtukDh">https://t.co/K8SnbtukDh</a></p></blockquote>'
}

describe('createXCaptureService enqueue', () => {
  it('enqueues a job for X post links and ignores other links', () => {
    const { service, repository } = makeService()

    expect(service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })).toBe(true)
    expect(service.enqueue({ id: 'link-2', url: 'https://example.com/a' })).toBe(false)

    expect(repository.list()).toHaveLength(1)
    expect(repository.get('link-1')?.tweetId).toBe('20')
  })
})

describe('createXCaptureService pass', () => {
  it('renders the capture, writes the PNG and records metadata', async () => {
    const { service, deps, repository } = makeService()
    service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })
    deps.fetchOEmbed.mockResolvedValue(POST)

    const summary = await service.runPass()

    expect(deps.fetchOEmbed).toHaveBeenCalledWith('20')
    expect(deps.renderCapture).toHaveBeenCalledWith('20', POST)
    expect(deps.writeCapture).toHaveBeenCalledWith('link-1', Buffer.from('fake-png'))
    expect(deps.upsertMetadata).toHaveBeenCalledWith({
      linkId: 'link-1',
      tweetId: '20',
      authorHandle: 'jack',
      authorName: 'jack',
      text: 'just setting up my twttr',
      postedAt: '2006-03-21T00:00:00.000Z',
      relatedUrl: null
    })
    expect(deps.enrichLink).toHaveBeenCalledWith('link-1', {
      title: 'just setting up my twttr',
      description: 'just setting up my twttr',
      author: 'jack',
      siteName: 'X'
    })
    expect(deps.updateCaptureState).toHaveBeenCalledWith('link-1', {
      status: 'ok',
      error: null,
      capturedAt: new Date(NOW).toISOString()
    })
    expect(repository.get('link-1')).toBeNull()
    expect(summary).toEqual({ processed: 1, failed: 0, retried: 0 })
  })

  it('still captures the PNG when oEmbed metadata is unavailable', async () => {
    const { service, deps, repository } = makeService()
    service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })
    deps.fetchOEmbed.mockResolvedValue(null)

    const summary = await service.runPass()

    expect(deps.renderCapture).toHaveBeenCalledWith('20', null)
    expect(deps.writeCapture).toHaveBeenCalled()
    expect(deps.upsertMetadata).not.toHaveBeenCalled()
    expect(deps.ensurePostRow).toHaveBeenCalledWith('link-1', '20')
    expect(deps.updateCaptureState).toHaveBeenCalledWith('link-1', {
      status: 'ok',
      error: null,
      capturedAt: new Date(NOW).toISOString()
    })
    expect(repository.get('link-1')).toBeNull()
    expect(summary).toEqual({ processed: 1, failed: 0, retried: 0 })
  })

  it('backs off when the capture render fails', async () => {
    const { service, deps, repository } = makeService()
    service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })
    deps.fetchOEmbed.mockResolvedValue(POST)
    deps.renderCapture.mockRejectedValue(new Error('embed blocked'))

    const summary = await service.runPass()

    const job = repository.get('link-1')
    expect(job?.status).toBe('pending')
    expect(job?.attempts).toBe(1)
    expect(job?.nextAttemptAt).toBeGreaterThan(NOW)
    expect(deps.writeCapture).not.toHaveBeenCalled()
    expect(summary).toEqual({ processed: 0, failed: 0, retried: 1 })
    expect(deps.notifyChanged).toHaveBeenCalled()
  })

  it('marks the capture failed after the attempt cap and surfaces the error', async () => {
    const { service, deps, repository } = makeService()
    service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })
    for (let attempt = 0; attempt < MAX_X_CAPTURE_ATTEMPTS - 1; attempt += 1) {
      repository.markAttempt('link-1', NOW)
    }
    deps.fetchOEmbed.mockResolvedValue(POST)
    deps.renderCapture.mockRejectedValue(new Error('embed blocked'))

    const summary = await service.runPass()

    const job = repository.get('link-1')
    expect(job?.status).toBe('failed')
    expect(job?.lastError).toEqual({ code: 'X_CAPTURE_FAILED', message: 'embed blocked' })
    expect(deps.updateCaptureState).toHaveBeenCalledWith('link-1', {
      status: 'failed',
      error: 'embed blocked'
    })
    expect(summary).toEqual({ processed: 0, failed: 1, retried: 0 })
  })

  it('requeues and retries a failed job on demand', async () => {
    const { service, deps, repository } = makeService()
    service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })
    repository.markFailed('link-1', { code: 'X_CAPTURE_FAILED', message: 'nope' })
    deps.fetchOEmbed.mockResolvedValue(POST)

    await service.retry('link-1')

    expect(deps.renderCapture).toHaveBeenCalled()
    expect(repository.get('link-1')).toBeNull()
  })

  it('saves the first external tweet link as a related link', async () => {
    const { service, deps } = makeService()
    service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })
    deps.fetchOEmbed.mockResolvedValue(LINK_POST)
    deps.expandLink.mockResolvedValue('https://example.com/story')

    await service.runPass()

    expect(deps.expandLink).toHaveBeenCalledWith('https://t.co/K8SnbtukDh')
    expect(deps.enqueueRelatedLink).toHaveBeenCalledWith('https://example.com/story', 'X')
    expect(deps.upsertMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ relatedUrl: 'https://example.com/story' })
    )
  })

  it('skips an unexpanded shortlink instead of saving the redirector', async () => {
    const { service, deps } = makeService()
    service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })
    deps.fetchOEmbed.mockResolvedValue(LINK_POST)
    deps.expandLink.mockResolvedValue(null)

    await service.runPass()

    expect(deps.enqueueRelatedLink).not.toHaveBeenCalled()
    expect(deps.upsertMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ relatedUrl: null })
    )
  })

  it('continues to the next candidate when a shortlink cannot be expanded', async () => {
    const { service, deps } = makeService()
    service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })
    deps.fetchOEmbed.mockResolvedValue({
      ...POST,
      html:
        '<blockquote><p>first <a href="https://t.co/broken">https://t.co/broken</a> then <a href="https://example.com/real">https://example.com/real</a></p></blockquote>'
    })
    deps.expandLink.mockImplementation(async (url) =>
      url === 'https://t.co/broken' ? null : 'https://example.com/real'
    )

    await service.runPass()

    expect(deps.enqueueRelatedLink).toHaveBeenCalledWith('https://example.com/real', 'X')
  })

  it('uses a direct external link without expanding it', async () => {
    const { service, deps } = makeService()
    service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })
    deps.fetchOEmbed.mockResolvedValue({
      ...POST,
      html: '<blockquote><p><a href="https://example.com/direct">https://example.com/direct</a></p></blockquote>'
    })

    await service.runPass()

    expect(deps.expandLink).not.toHaveBeenCalled()
    expect(deps.enqueueRelatedLink).toHaveBeenCalledWith('https://example.com/direct', 'X')
  })

  it('drops the job when its link no longer exists', async () => {
    const store = memoryStore()
    const repository = new XCaptureRepository(store, () => NOW)
    const deps = {
      repository,
      fetchOEmbed: vi.fn(),
      renderCapture: vi.fn(),
      writeCapture: vi.fn(),
      expandLink: vi.fn(),
      enqueueRelatedLink: vi.fn(),
      upsertMetadata: vi.fn().mockResolvedValue(undefined),
      ensurePostRow: vi.fn().mockResolvedValue(undefined),
      updateCaptureState: vi.fn().mockResolvedValue(undefined),
      enrichLink: vi.fn().mockResolvedValue(undefined),
      linkExists: vi.fn().mockResolvedValue(false),
      now: () => NOW,
      notifyChanged: vi.fn()
    }
    const service = createXCaptureService(deps)
    service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })

    const summary = await service.runPass()

    expect(deps.renderCapture).not.toHaveBeenCalled()
    expect(deps.writeCapture).not.toHaveBeenCalled()
    expect(repository.get('link-1')).toBeNull()
    expect(summary).toEqual({ processed: 1, failed: 0, retried: 0 })
  })

  it('fails permanently on a tweet-id collision instead of retrying', async () => {
    const { service, deps, repository } = makeService()
    service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })
    deps.fetchOEmbed.mockResolvedValue(POST)
    deps.upsertMetadata.mockRejectedValue(new DatabaseError('duplicate key value', '23505'))

    const summary = await service.runPass()

    expect(repository.get('link-1')?.status).toBe('failed')
    expect(summary).toEqual({ processed: 0, failed: 1, retried: 0 })
  })

  it('does not enqueue a related link when the tweet has none', async () => {
    const { service, deps } = makeService()
    service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })
    deps.fetchOEmbed.mockResolvedValue(POST)

    await service.runPass()

    expect(deps.enqueueRelatedLink).not.toHaveBeenCalled()
  })

  it('still succeeds when related-link enqueueing fails', async () => {
    const { service, deps, repository } = makeService()
    service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })
    deps.fetchOEmbed.mockResolvedValue(LINK_POST)
    deps.expandLink.mockResolvedValue('https://example.com/story')
    deps.enqueueRelatedLink.mockRejectedValue(new Error('offline'))

    const summary = await service.runPass()

    expect(summary).toEqual({ processed: 1, failed: 0, retried: 0 })
    expect(repository.get('link-1')).toBeNull()
  })
})

describe('isCaptureCompleted', () => {
  it('is true only when the retry pass produced a finished capture', () => {
    expect(isCaptureCompleted({ processed: 1, failed: 0, retried: 0 })).toBe(true)
    expect(isCaptureCompleted({ processed: 0, failed: 0, retried: 1 })).toBe(false)
    expect(isCaptureCompleted({ processed: 0, failed: 1, retried: 0 })).toBe(false)
  })
})

describe('x capture notifications', () => {
  it('reports a finished capture with the tweet author and text', async () => {
    const { service, deps } = makeService()
    service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })
    deps.fetchOEmbed.mockResolvedValue(POST)

    await service.runPass()

    expect(deps.notifyCapture).toHaveBeenCalledWith({
      author: 'jack',
      text: 'just setting up my twttr',
      ok: true
    })
  })

  it('reports a terminal failure once so the user can retry', async () => {
    const { service, deps, repository } = makeService()
    service.enqueue({ id: 'link-1', url: 'https://x.com/jack/status/20' })
    for (let attempt = 0; attempt < MAX_X_CAPTURE_ATTEMPTS - 1; attempt += 1) {
      repository.markAttempt('link-1', NOW)
    }
    deps.renderCapture.mockRejectedValue(new Error('embed blocked'))

    await service.runPass()

    expect(deps.notifyCapture).toHaveBeenCalledWith({ author: null, text: null, ok: false })
  })
})

describe('toLinkEnrichment', () => {
  it('maps tweet text to a title/description and the author to the link fields', () => {
    expect(toLinkEnrichment(POST)).toEqual({
      title: 'just setting up my twttr',
      description: 'just setting up my twttr',
      author: 'jack',
      siteName: 'X'
    })
  })

  it('truncates long titles to the first line and bounds the description', () => {
    const longText = `${'a'.repeat(200)}\nsecond line`
    const enrichment = toLinkEnrichment({ ...POST, text: longText })
    expect(enrichment.title?.length).toBeLessThanOrEqual(140)
    expect(enrichment.title?.endsWith('…')).toBe(true)
    expect(enrichment.description?.startsWith('a'.repeat(200))).toBe(true)
  })

  it('returns nulls for an empty tweet body', () => {
    expect(toLinkEnrichment({ ...POST, text: null })).toEqual({
      title: null,
      description: null,
      author: 'jack',
      siteName: 'X'
    })
  })
})
