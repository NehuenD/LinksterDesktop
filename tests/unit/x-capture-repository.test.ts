import { describe, expect, it } from 'vitest'
import {
  X_CAPTURE_SCHEMA_VERSION,
  XCaptureRepository,
  type XCapturePersistence,
  type XCaptureStoreAdapter
} from '../../src/main/data/x-capture-repository'

function memoryStore(
  initial?: Partial<XCapturePersistence>
): XCaptureStoreAdapter & { data: XCapturePersistence } {
  const data: XCapturePersistence = {
    schemaVersion: initial?.schemaVersion ?? X_CAPTURE_SCHEMA_VERSION,
    jobs: initial?.jobs ?? []
  }
  return {
    data,
    read: () => structuredClone(data),
    write: (next) => {
      data.schemaVersion = next.schemaVersion
      data.jobs = structuredClone(next.jobs)
    }
  }
}

const AT = new Date('2026-09-17T10:00:00.000Z').getTime()
const ISO = new Date(AT).toISOString()

function makeRepo(store: XCaptureStoreAdapter, now = () => AT) {
  return new XCaptureRepository(store, now)
}

describe('XCaptureRepository', () => {
  it('enqueues a pending capture job with default retry fields', () => {
    const repo = makeRepo(memoryStore())

    const job = repo.enqueue({
      linkId: 'link-1',
      url: 'https://x.com/jack/status/20',
      tweetId: '20'
    })

    expect(job).toMatchObject({
      linkId: 'link-1',
      url: 'https://x.com/jack/status/20',
      tweetId: '20',
      status: 'pending',
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      createdAt: ISO,
      updatedAt: ISO
    })
    expect(repo.count()).toBe(1)
  })

  it('dedupes by link id and keeps the original job', () => {
    const repo = makeRepo(memoryStore())
    repo.enqueue({ linkId: 'link-1', url: 'https://x.com/a/status/1', tweetId: '1' })

    const second = repo.enqueue({
      linkId: 'link-1',
      url: 'https://x.com/a/status/1',
      tweetId: '1'
    })

    expect(second.createdAt).toBe(ISO)
    expect(repo.count()).toBe(1)
  })

  it('persists jobs across repository instances (restart)', () => {
    const store = memoryStore()
    makeRepo(store).enqueue({ linkId: 'link-1', url: 'https://x.com/a/status/1', tweetId: '1' })

    const reopened = makeRepo(store)
    expect(reopened.list()).toHaveLength(1)
    expect(reopened.get('link-1')?.tweetId).toBe('1')
    expect(reopened.get('link-2')).toBeNull()
  })

  it('lists only due pending jobs', () => {
    const repo = makeRepo(memoryStore())
    repo.enqueue({ linkId: 'link-1', url: 'https://x.com/a/status/1', tweetId: '1' })
    repo.enqueue({ linkId: 'link-2', url: 'https://x.com/b/status/2', tweetId: '2' })
    repo.markAttempt('link-1', AT + 5_000)

    expect(repo.listDue(AT).map((job) => job.linkId)).toEqual(['link-2'])
    expect(repo.listDue(AT + 5_000).map((job) => job.linkId)).toEqual(['link-1', 'link-2'])
  })

  it('markAttempt increments attempts and schedules the next try', () => {
    const repo = makeRepo(memoryStore())
    repo.enqueue({ linkId: 'link-1', url: 'https://x.com/a/status/1', tweetId: '1' })

    repo.markAttempt('link-1', AT + 2_000)

    const job = repo.get('link-1')
    expect(job?.attempts).toBe(1)
    expect(job?.nextAttemptAt).toBe(AT + 2_000)
    expect(job?.status).toBe('pending')
  })

  it('markFailed keeps the job for manual retry and removes it from the due set', () => {
    const repo = makeRepo(memoryStore())
    repo.enqueue({ linkId: 'link-1', url: 'https://x.com/a/status/1', tweetId: '1' })

    repo.markFailed('link-1', { code: 'CAPTURE_FAILED', message: 'embed blocked' })

    const job = repo.get('link-1')
    expect(job?.status).toBe('failed')
    expect(job?.lastError).toEqual({ code: 'CAPTURE_FAILED', message: 'embed blocked' })
    expect(repo.listDue(AT + 10_000_000)).toHaveLength(0)
  })

  it('requeues a failed job for immediate retry', () => {
    const repo = makeRepo(memoryStore())
    repo.enqueue({ linkId: 'link-1', url: 'https://x.com/a/status/1', tweetId: '1' })
    repo.markFailed('link-1', { code: 'CAPTURE_FAILED', message: 'nope' })

    repo.requeue('link-1')

    const job = repo.get('link-1')
    expect(job?.status).toBe('pending')
    expect(job?.attempts).toBe(0)
    expect(job?.nextAttemptAt).toBeNull()
    expect(job?.lastError).toBeNull()
    expect(repo.listDue(AT).map((due) => due.linkId)).toEqual(['link-1'])
  })

  it('removes one or many jobs', () => {
    const repo = makeRepo(memoryStore())
    repo.enqueue({ linkId: 'link-1', url: 'https://x.com/a/status/1', tweetId: '1' })
    repo.enqueue({ linkId: 'link-2', url: 'https://x.com/b/status/2', tweetId: '2' })

    repo.remove('link-1')
    repo.removeMany(['link-2'])

    expect(repo.count()).toBe(0)
  })

  it('tolerates a corrupt or empty persistence payload', () => {
    const repo = makeRepo({
      read: () => ({ schemaVersion: 0, jobs: null }) as unknown as XCapturePersistence,
      write: () => undefined
    })
    expect(repo.list()).toEqual([])
  })

  it('purges only the requested owner', () => {
    const repo = makeRepo(memoryStore())
    repo.enqueue({ linkId: 'link-1', url: 'https://x.com/a/status/1', tweetId: '1', ownerUserId: 'user-a' })
    repo.enqueue({ linkId: 'link-2', url: 'https://x.com/b/status/2', tweetId: '2', ownerUserId: 'user-b' })

    expect(repo.purgeOwner('user-a')).toBe(1)
    expect(repo.list().map((job) => job.linkId)).toEqual(['link-2'])
  })
})
