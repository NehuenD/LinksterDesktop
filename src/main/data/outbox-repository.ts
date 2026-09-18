import { randomUUID } from 'node:crypto'
import type { OutboxError, OutboxItem, OutboxStatus } from '@shared/contract/ipc'

export const OUTBOX_SCHEMA_VERSION = 3

export interface OutboxPersistence {
  schemaVersion: number
  items: OutboxItem[]
}

/**
 * Minimal persistence seam so the repository can be unit-tested without
 * Electron. The production adapter is backed by electron-store.
 */
export interface OutboxStoreAdapter {
  read(): OutboxPersistence
  write(data: OutboxPersistence): void
}

export interface EnqueueInput {
  url: string
  normalizedUrl: string
  label: string
  note?: string | null
  /** Defaults to null (unowned); production capture paths always set it. */
  ownerUserId?: string | null
}

export interface EnqueueResult {
  item: OutboxItem
  created: boolean
}

function emptyPersistence(): OutboxPersistence {
  return { schemaVersion: OUTBOX_SCHEMA_VERSION, items: [] }
}

/**
 * Durable capture outbox. Items are enqueued before any network work and only
 * removed once the link is persisted server-side. Pure over its adapter.
 */
export class OutboxRepository {
  constructor(
    private readonly store: OutboxStoreAdapter,
    private readonly now: () => number = Date.now,
    private readonly idFactory: () => string = randomUUID
  ) {}

  private load(): OutboxPersistence {
    const data = this.store.read()
    if (!data || !Array.isArray(data.items)) return emptyPersistence()
    // v2 adds an optional note; legacy items normalize to null. v3 adds the
    // owning user id so a sign-out can never leak captures into another account.
    const items = data.items.map((item) => ({
      ...item,
      note: item.note ?? null,
      ownerUserId: item.ownerUserId ?? null
    }))
    return { schemaVersion: OUTBOX_SCHEMA_VERSION, items }
  }

  private save(items: OutboxItem[]): void {
    this.store.write({ schemaVersion: OUTBOX_SCHEMA_VERSION, items })
  }

  list(): OutboxItem[] {
    return this.load().items
  }

  count(): number {
    return this.load().items.length
  }

  get(id: string): OutboxItem | null {
    return this.load().items.find((item) => item.id === id) ?? null
  }

  findByNormalizedUrl(normalizedUrl: string, ownerUserId?: string | null): OutboxItem | null {
    return (
      this.load().items.find(
        (item) =>
          item.normalizedUrl === normalizedUrl &&
          (ownerUserId === undefined || item.ownerUserId === ownerUserId)
      ) ?? null
    )
  }

  /** Pending items whose backoff has elapsed (or that have never been attempted). */
  listDue(now: number = this.now()): OutboxItem[] {
    return this.load().items.filter(
      (item) =>
        item.status === 'pending' && (item.nextAttemptAt === null || item.nextAttemptAt <= now)
    )
  }

  enqueue(input: EnqueueInput): EnqueueResult {
    const items = this.load().items
    const existing = items.find(
      (item) =>
        item.normalizedUrl === input.normalizedUrl &&
        item.ownerUserId === (input.ownerUserId ?? null)
    )
    if (existing) return { item: existing, created: false }

    const timestamp = new Date(this.now()).toISOString()
    const item: OutboxItem = {
      id: this.idFactory(),
      url: input.url,
      normalizedUrl: input.normalizedUrl,
      label: input.label,
      note: input.note ?? null,
      ownerUserId: input.ownerUserId ?? null,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      createdAt: timestamp,
      updatedAt: timestamp
    }

    this.save([...items, item])
    return { item, created: true }
  }

  markAttempt(id: string, nextAttemptAt: number): void {
    this.update(id, (item) => ({
      ...item,
      attempts: item.attempts + 1,
      status: 'pending' as OutboxStatus,
      nextAttemptAt
    }))
  }

  markFailed(id: string, error: OutboxError): void {
    this.update(id, (item) => ({
      ...item,
      status: 'failed' as OutboxStatus,
      lastError: error,
      nextAttemptAt: null
    }))
  }

  /** Resets a failed item to pending and due immediately (manual Retry). */
  requeue(id: string): void {
    this.update(id, (item) => ({
      ...item,
      status: 'pending' as OutboxStatus,
      attempts: 0,
      nextAttemptAt: null,
      lastError: null
    }))
  }

  remove(id: string): void {
    const items = this.load().items
    this.save(items.filter((item) => item.id !== id))
  }

  /** Removes every item owned by `ownerUserId`; returns how many were removed. */
  purgeOwner(ownerUserId: string | null): number {
    const items = this.load().items
    const kept = items.filter((item) => item.ownerUserId !== ownerUserId)
    const removed = items.length - kept.length
    if (removed > 0) this.save(kept)
    return removed
  }

  private update(id: string, patch: (item: OutboxItem) => OutboxItem): void {
    const items = this.load().items
    this.save(
      items.map((item) =>
        item.id === id
          ? { ...patch(item), updatedAt: new Date(this.now()).toISOString() }
          : item
      )
    )
  }
}
