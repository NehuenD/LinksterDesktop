import type { XCaptureStatus } from '@shared/contract/ipc'
import { canonicalizeLinkUrl } from '@shared/lib/link-url'
import { parseXPostUrl } from '@shared/lib/x-url'
import type { XCaptureJob, XCaptureRepository } from '../data/x-capture-repository'
import { isUniqueViolation } from '../data/db-error'
import type { XPostMetadataInput } from '../data/x-post-repository'
import type { LinkMetadataEnrichment } from '../data/link-repository'
import { createDrainGate } from './drain-gate'
import { computeBackoffDelay } from './outbox-backoff'
import { isMediaOrInternalLink, xPostExternalLinks, type XPostData } from './x-embed'
import { assertPublicHost, validateUrl } from './url-validator'

export const MAX_X_CAPTURE_ATTEMPTS = 6

/** Caps outbound work for one tweet's related-link expansion. */
const MAX_RELATED_CANDIDATES = 3
const MAX_TCO_EXPANSIONS = 2

/** Library label applied to links captured from inside a tweet. */
export const X_RELATED_LINK_LABEL = 'X'

const TITLE_MAX = 140
const DESCRIPTION_MAX = 500

export interface XCaptureSummary {
  processed: number
  failed: number
  retried: number
}

/** True only when a pass finished at least one capture (vs. requeued or failed). */
export function isCaptureCompleted(summary: XCaptureSummary): boolean {
  return summary.processed > 0
}

export interface XCaptureDeps {
  repository: XCaptureRepository
  fetchOEmbed: (tweetId: string) => Promise<XPostData | null>
  renderCapture: (tweetId: string, post: XPostData | null) => Promise<Buffer>
  writeCapture: (linkId: string, png: Buffer) => void
  expandLink: (url: string) => Promise<string | null>
  enqueueRelatedLink: (url: string, label: string) => Promise<void>
  upsertMetadata: (input: XPostMetadataInput) => Promise<void>
  ensurePostRow: (linkId: string, tweetId: string) => Promise<void>
  updateCaptureState: (linkId: string, state: { status: XCaptureStatus; error?: string | null; capturedAt?: string | null }) => Promise<void>
  enrichLink: (linkId: string, fields: LinkMetadataEnrichment) => Promise<void>
  /** Drops jobs whose link no longer exists (deleted locally or remotely). */
  linkExists?: (linkId: string) => Promise<boolean>
  /**
   * Signed-in account for job ownership. Returning null pauses the queue;
   * undefined (tests) disables ownership filtering.
   */
  getOwnerUserId?: () => string | null
  now?: () => number
  notifyChanged?: () => void
  /** Capture-result signal (OS notification / toast) for one post. */
  notifyCapture?: (result: { author: string | null; text: string | null; ok: boolean }) => void
}

export interface XCaptureService {
  /** Queues a capture for an X post link; returns false for non-X links. */
  enqueue(link: { id: string; url: string }): boolean
  retry(linkId: string): Promise<XCaptureSummary>
  runPass(): Promise<XCaptureSummary>
  repository: XCaptureRepository
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
}

/** Maps tweet metadata onto the link's own fields (blank-only fill upstream). */
export function toLinkEnrichment(post: XPostData): LinkMetadataEnrichment {
  const text = post.text?.trim() ?? ''
  if (text.length === 0) {
    return { title: null, description: null, author: post.authorName, siteName: 'X' }
  }

  const firstLine = text.split('\n')[0].trim()
  return {
    title: truncate(firstLine, TITLE_MAX),
    description: truncate(text, DESCRIPTION_MAX),
    author: post.authorName,
    siteName: 'X'
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * First non-media, non-X link in the tweet. `t.co` shortlinks are expanded and
 * skipped when expansion fails, so a redirector is never saved as the related
 * library link; direct external links need no expansion.
 */
async function firstRelatedLink(
  post: XPostData,
  expand: (url: string) => Promise<string | null>
): Promise<string | null> {
  let examined = 0
  let expansions = 0

  for (const candidate of xPostExternalLinks(post.html)) {
    if (examined >= MAX_RELATED_CANDIDATES) break
    examined += 1

    let target = candidate

    let host: string
    try {
      host = new URL(candidate).hostname.toLowerCase()
    } catch {
      continue
    }

    if (host === 't.co') {
      if (expansions >= MAX_TCO_EXPANSIONS) continue
      expansions += 1
      const expanded = await expand(candidate).catch(() => null)
      if (!expanded) continue
      target = expanded
    }

    // Every candidate is a URL lifted from remote HTML: validate the scheme
    // and resolve the host before it can reach the outbox or the library.
    const validation = validateUrl(target)
    if (!validation.valid) continue
    let resolvedHost: string
    try {
      resolvedHost = new URL(validation.url).hostname
    } catch {
      continue
    }
    const publicHost = await assertPublicHost(resolvedHost).catch(() => false)
    if (!publicHost) continue

    if (!isMediaOrInternalLink(validation.url)) return validation.url
  }
  return null
}

export function createXCaptureService(deps: XCaptureDeps): XCaptureService {
  const now = deps.now ?? Date.now
  const { repository } = deps

  async function processJob(job: XCaptureJob): Promise<void> {
    // A link deleted (locally or on another device) mid-flight must drop its
    // job instead of writing an orphan PNG.
    if (deps.linkExists && !(await deps.linkExists(job.linkId))) {
      repository.remove(job.linkId)
      return
    }

    // Metadata is best-effort: the rendered PNG is the required artifact, so an
    // oEmbed outage must not block or fail the capture.
    const post = await deps.fetchOEmbed(job.tweetId).catch(() => null)

    const png = await deps.renderCapture(job.tweetId, post)
    if (png.length === 0) throw new Error('Capture render produced an empty image')

    if (post) {
      const relatedUrl = await firstRelatedLink(post, deps.expandLink)
      // Store the canonical form so the DB resolver can match the link row
      // (which is itself stored canonicalized: youtu.be -> youtube.com/watch).
      const canonicalRelated = relatedUrl ? canonicalizeLinkUrl(relatedUrl) : null
      await deps.upsertMetadata({
        linkId: job.linkId,
        tweetId: job.tweetId,
        authorHandle: post.authorHandle,
        authorName: post.authorName,
        text: post.text,
        postedAt: post.postedAt,
        relatedUrl: canonicalRelated
      })
      await deps.enrichLink(job.linkId, toLinkEnrichment(post))

      if (canonicalRelated) {
        try {
          await deps.enqueueRelatedLink(canonicalRelated, X_RELATED_LINK_LABEL)
        } catch {
          // The URL stays on the post row; the related link can be captured later.
        }
      }
    } else {
      // No metadata, but the row must exist so the capture state can be stored.
      await deps.ensurePostRow(job.linkId, job.tweetId)
    }

    // Metadata first: when the link was deleted after the existence check, the
    // foreign key fails here and no PNG is ever written for a missing row.
    deps.writeCapture(job.linkId, png)

    await deps.updateCaptureState(job.linkId, {
      status: 'ok',
      error: null,
      capturedAt: new Date(now()).toISOString()
    })
    repository.remove(job.linkId)
    deps.notifyCapture?.({
      author: post?.authorName ?? null,
      text: post?.text ?? null,
      ok: true
    })
  }

  async function runPass(): Promise<XCaptureSummary> {
    const summary: XCaptureSummary = { processed: 0, failed: 0, retried: 0 }
    const owner = deps.getOwnerUserId?.()
    if (owner === null) return summary

    const due = repository
      .listDue(now())
      .filter((job) => owner === undefined || job.ownerUserId === owner)
    if (due.length === 0) return summary

    for (const job of due) {
      try {
        await processJob(job)
        summary.processed += 1
      } catch (error) {
        const attempts = job.attempts + 1
        const message = toMessage(error)
        // A (user_id, tweet_id) collision is terminal: retrying cannot succeed.
        const terminal = isUniqueViolation(error) || attempts >= MAX_X_CAPTURE_ATTEMPTS
        if (terminal) {
          repository.markFailed(job.linkId, { code: 'X_CAPTURE_FAILED', message })
          try {
            await deps.updateCaptureState(job.linkId, { status: 'failed', error: message })
          } catch {
            // State mirroring is best-effort; the local job still offers Retry.
          }
          summary.failed += 1
          deps.notifyCapture?.({ author: null, text: null, ok: false })
        } else {
          repository.markAttempt(job.linkId, now() + computeBackoffDelay(attempts))
          summary.retried += 1
        }
      }
    }

    if (summary.processed + summary.failed + summary.retried > 0) deps.notifyChanged?.()
    return summary
  }

  const gate = createDrainGate(runPass)

  return {
    enqueue(link) {
      const parsed = parseXPostUrl(link.url)
      if (!parsed) return false
      const owner = deps.getOwnerUserId?.()
      if (owner === null) return false
      repository.enqueue({
        linkId: link.id,
        url: link.url,
        tweetId: parsed.tweetId,
        ownerUserId: owner ?? null
      })
      deps.notifyChanged?.()
      return true
    },
    async retry(linkId) {
      const owner = deps.getOwnerUserId?.()
      if (owner === null) return { processed: 0, failed: 0, retried: 0 }
      const job = repository.get(linkId)
      if (job && (owner === undefined || job.ownerUserId === owner)) {
        repository.requeue(linkId)
        deps.notifyChanged?.()
      }
      return gate()
    },
    runPass: gate,
    repository
  }
}
