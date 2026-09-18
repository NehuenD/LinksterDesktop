import { describe, expect, it } from 'vitest'
import type { OutboxItem } from '@shared/contract/ipc'
import {
  OUTBOX_SCHEMA_VERSION,
  OutboxRepository,
  type OutboxPersistence,
  type OutboxStoreAdapter
} from '../../src/main/data/outbox-repository'

function memoryStore(
  initial?: Partial<OutboxPersistence>
): OutboxStoreAdapter & { data: OutboxPersistence } {
  const data: OutboxPersistence = {
    schemaVersion: initial?.schemaVersion ?? OUTBOX_SCHEMA_VERSION,
    items: initial?.items ?? []
  }
  return {
    data,
    read: () => structuredClone(data),
    write: (next) => {
      data.schemaVersion = next.schemaVersion
      data.items = structuredClone(next.items)
    }
  }
}

function sequencer(prefix: string): () => string {
  let count = 0
  return () => {
    count += 1
    return `${prefix}-${count}`
  }
}

const AT = new Date('2026-09-15T10:00:00.000Z').getTime()
const ISO = new Date(AT).toISOString()

function makeRepo(store: OutboxStoreAdapter, now = () => AT) {
  return new OutboxRepository(store, now, sequencer('id'))
}

describe('OutboxRepository', () => {
  it('enqueues a pending item with default retry fields', () => {
    const store = memoryStore()
    const repo = makeRepo(store)

    const { item, created } = repo.enqueue({
      url: 'https://example.com/',
      normalizedUrl: 'https://example.com',
      label: 'General'
    })

    expect(created).toBe(true)
    expect(item).toMatchObject({
      id: 'id-1',
      url: 'https://example.com/',
      normalizedUrl: 'https://example.com',
      label: 'General',
      note: null,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      createdAt: ISO,
      updatedAt: ISO
    })
    expect(repo.count()).toBe(1)
  })

  it('persists an optional note through enqueue and restart', () => {
    const store = memoryStore()
    makeRepo(store).enqueue({
      url: 'https://a.com/',
      normalizedUrl: 'https://a.com',
      label: 'Reading',
      note: 'Read this weekend'
    })

    const reopened = makeRepo(store)
    expect(reopened.findByNormalizedUrl('https://a.com')?.note).toBe('Read this weekend')
  })

  it('defaults a legacy item without a note to null', () => {
    const legacy = {
      id: 'legacy-1',
      url: 'https://a.com/',
      normalizedUrl: 'https://a.com',
      label: 'General',
      status: 'pending',
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      createdAt: ISO,
      updatedAt: ISO
    } as unknown as OutboxItem

    const repo = makeRepo(memoryStore({ schemaVersion: 1, items: [legacy] }))
    expect(repo.get('legacy-1')?.note).toBeNull()
  })

  it('dedupes by normalized URL and reports the existing item', () => {
    const repo = makeRepo(memoryStore())

    repo.enqueue({ url: 'https://a.com/x', normalizedUrl: 'https://a.com/x', label: 'General' })
    const second = repo.enqueue({
      url: 'https://a.com/x?utm_source=z',
      normalizedUrl: 'https://a.com/x',
      label: 'News'
    })

    expect(second.created).toBe(false)
    expect(second.item.id).toBe('id-1')
    expect(second.item.label).toBe('General')
    expect(repo.count()).toBe(1)
  })

  it('never dedupes across accounts and keeps owner lookups isolated', () => {
    const repo = makeRepo(memoryStore())

    repo.enqueue({
      url: 'https://a.com/x',
      normalizedUrl: 'https://a.com/x',
      label: 'General',
      ownerUserId: 'user-a'
    })
    const second = repo.enqueue({
      url: 'https://a.com/x',
      normalizedUrl: 'https://a.com/x',
      label: 'News',
      ownerUserId: 'user-b'
    })

    expect(second.created).toBe(true)
    expect(repo.count()).toBe(2)
    expect(repo.findByNormalizedUrl('https://a.com/x', 'user-a')?.label).toBe('General')
    expect(repo.findByNormalizedUrl('https://a.com/x', 'user-b')?.label).toBe('News')
  })

  it('purges only the requested owner', () => {
    const repo = makeRepo(memoryStore())
    repo.enqueue({
      url: 'https://a.com/',
      normalizedUrl: 'https://a.com',
      label: 'General',
      ownerUserId: 'user-a'
    })
    repo.enqueue({
      url: 'https://b.com/',
      normalizedUrl: 'https://b.com',
      label: 'General',
      ownerUserId: 'user-b'
    })

    expect(repo.purgeOwner('user-a')).toBe(1)
    expect(repo.list()).toHaveLength(1)
    expect(repo.list()[0]?.ownerUserId).toBe('user-b')
    expect(repo.purgeOwner('user-a')).toBe(0)
  })

  it('persists items across repository instances (restart)', () => {
    const store = memoryStore()
    makeRepo(store).enqueue({
      url: 'https://example.com/',
      normalizedUrl: 'https://example.com',
      label: 'General'
    })

    const reopened = makeRepo(store)
    expect(reopened.list()).toHaveLength(1)
    expect(reopened.findByNormalizedUrl('https://example.com')?.url).toBe('https://example.com/')
    expect(reopened.findByNormalizedUrl('https://other.com')).toBeNull()
  })

  it('lists only due pending items', () => {
    const repo = makeRepo(memoryStore())
    repo.enqueue({ url: 'https://a.com/', normalizedUrl: 'https://a.com', label: 'General' })
    repo.enqueue({ url: 'https://b.com/', normalizedUrl: 'https://b.com', label: 'General' })
    repo.markAttempt('id-1', AT + 5_000)

    expect(repo.listDue(AT).map((item) => item.id)).toEqual(['id-2'])
    expect(repo.listDue(AT + 5_000).map((item) => item.id)).toEqual(['id-1', 'id-2'])
  })

  it('markAttempt increments attempts and schedules the next try', () => {
    const repo = makeRepo(memoryStore())
    repo.enqueue({ url: 'https://a.com/', normalizedUrl: 'https://a.com', label: 'General' })

    repo.markAttempt('id-1', AT + 2_000)

    const item = repo.get('id-1')
    expect(item?.attempts).toBe(1)
    expect(item?.nextAttemptAt).toBe(AT + 2_000)
    expect(item?.status).toBe('pending')
    expect(item?.updatedAt).toBe(ISO)
  })

  it('markFailed marks an item failed and removes it from the due set', () => {
    const repo = makeRepo(memoryStore())
    repo.enqueue({ url: 'https://a.com/', normalizedUrl: 'https://a.com', label: 'General' })

    repo.markFailed('id-1', { code: 'NETWORK', message: 'offline' })

    const item = repo.get('id-1')
    expect(item?.status).toBe('failed')
    expect(item?.lastError).toEqual({ code: 'NETWORK', message: 'offline' })
    expect(repo.listDue(AT + 10_000_000)).toHaveLength(0)
  })

  it('requeues a failed item for immediate retry', () => {
    const repo = makeRepo(memoryStore())
    repo.enqueue({ url: 'https://a.com/', normalizedUrl: 'https://a.com', label: 'General' })
    repo.markFailed('id-1', { code: 'NETWORK', message: 'offline' })

    repo.requeue('id-1')

    const item = repo.get('id-1')
    expect(item?.status).toBe('pending')
    expect(item?.attempts).toBe(0)
    expect(item?.nextAttemptAt).toBeNull()
    expect(item?.lastError).toBeNull()
    expect(repo.listDue(AT).map((due) => due.id)).toEqual(['id-1'])
  })

  it('removes an item', () => {
    const repo = makeRepo(memoryStore())
    repo.enqueue({ url: 'https://a.com/', normalizedUrl: 'https://a.com', label: 'General' })

    repo.remove('id-1')

    expect(repo.get('id-1')).toBeNull()
    expect(repo.count()).toBe(0)
  })

  it('writes the schema version into the store', () => {
    const store = memoryStore({ schemaVersion: 0, items: [] })
    makeRepo(store).enqueue({
      url: 'https://a.com/',
      normalizedUrl: 'https://a.com',
      label: 'General'
    })

    expect(store.data.schemaVersion).toBe(OUTBOX_SCHEMA_VERSION)
  })
})
