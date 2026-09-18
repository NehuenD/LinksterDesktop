import type { OutboxError } from '@shared/contract/ipc'

export const X_CAPTURE_SCHEMA_VERSION = 2

export type XCaptureJobStatus = 'pending' | 'failed'

/**
 * A durable local job for rendering/capturing one X post. Created after the
 * post's link is persisted; removed once the PNG and metadata are written.
 */
export interface XCaptureJob {
  linkId: string
  url: string
  tweetId: string
  /** Account the job belongs to; jobs never render under another session. */
  ownerUserId: string | null
  status: XCaptureJobStatus
  attempts: number
  nextAttemptAt: number | null
  lastError: OutboxError | null
  createdAt: string
  updatedAt: string
}

export interface XCapturePersistence {
  schemaVersion: number
  jobs: XCaptureJob[]
}

/** Persistence seam so the repository is unit-testable without Electron. */
export interface XCaptureStoreAdapter {
  read(): XCapturePersistence
  write(data: XCapturePersistence): void
}

export interface EnqueueXCaptureInput {
  linkId: string
  url: string
  tweetId: string
  /** Defaults to null (unowned); production capture paths always set it. */
  ownerUserId?: string | null
}

function emptyPersistence(): XCapturePersistence {
  return { schemaVersion: X_CAPTURE_SCHEMA_VERSION, jobs: [] }
}

export class XCaptureRepository {
  constructor(
    private readonly store: XCaptureStoreAdapter,
    private readonly now: () => number = Date.now
  ) {}

  private load(): XCapturePersistence {
    const data = this.store.read()
    if (!data || !Array.isArray(data.jobs)) return emptyPersistence()
    const jobs = data.jobs.map((job) => ({
      ...job,
      ownerUserId: job.ownerUserId ?? null
    }))
    return { schemaVersion: X_CAPTURE_SCHEMA_VERSION, jobs }
  }

  private save(jobs: XCaptureJob[]): void {
    this.store.write({ schemaVersion: X_CAPTURE_SCHEMA_VERSION, jobs })
  }

  list(): XCaptureJob[] {
    return this.load().jobs
  }

  count(): number {
    return this.load().jobs.length
  }

  get(linkId: string): XCaptureJob | null {
    return this.load().jobs.find((job) => job.linkId === linkId) ?? null
  }

  /** Pending jobs whose backoff has elapsed (or that have never been attempted). */
  listDue(now: number = this.now()): XCaptureJob[] {
    return this.load().jobs.filter(
      (job) =>
        job.status === 'pending' &&
        (job.nextAttemptAt === null || job.nextAttemptAt <= now)
    )
  }

  enqueue(input: EnqueueXCaptureInput): XCaptureJob {
    const jobs = this.load().jobs
    const existing = jobs.find((job) => job.linkId === input.linkId)
    if (existing) return existing

    const timestamp = new Date(this.now()).toISOString()
    const job: XCaptureJob = {
      linkId: input.linkId,
      url: input.url,
      tweetId: input.tweetId,
      ownerUserId: input.ownerUserId ?? null,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      createdAt: timestamp,
      updatedAt: timestamp
    }

    this.save([...jobs, job])
    return job
  }

  markAttempt(linkId: string, nextAttemptAt: number): void {
    this.update(linkId, (job) => ({
      ...job,
      attempts: job.attempts + 1,
      status: 'pending',
      nextAttemptAt
    }))
  }

  markFailed(linkId: string, error: OutboxError): void {
    this.update(linkId, (job) => ({
      ...job,
      status: 'failed',
      lastError: error,
      nextAttemptAt: null
    }))
  }

  /** Resets a failed job to pending and due immediately (manual Retry). */
  requeue(linkId: string): void {
    this.update(linkId, (job) => ({
      ...job,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: null,
      lastError: null
    }))
  }

  remove(linkId: string): void {
    this.save(this.load().jobs.filter((job) => job.linkId !== linkId))
  }

  removeMany(linkIds: readonly string[]): void {
    if (linkIds.length === 0) return
    const ids = new Set(linkIds)
    this.save(this.load().jobs.filter((job) => !ids.has(job.linkId)))
  }

  /** Removes every job owned by `ownerUserId`; returns how many were removed. */
  purgeOwner(ownerUserId: string | null): number {
    const jobs = this.load().jobs
    const kept = jobs.filter((job) => job.ownerUserId !== ownerUserId)
    const removed = jobs.length - kept.length
    if (removed > 0) this.save(kept)
    return removed
  }

  private update(linkId: string, patch: (job: XCaptureJob) => XCaptureJob): void {
    this.save(
      this.load().jobs.map((job) =>
        job.linkId === linkId
          ? { ...patch(job), updatedAt: new Date(this.now()).toISOString() }
          : job
      )
    )
  }
}
