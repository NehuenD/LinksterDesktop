import { BrowserWindow, Notification } from 'electron'
import {
  DEFAULT_LABEL,
  IPC,
  type DrainSummary,
  type Link,
  type LinkKind,
  type OutboxError,
  type OutboxItem,
  type PendingCapture,
  type QuickCaptureOutcome
} from '@shared/contract/ipc'
import { classifyLinkKind, canonicalizeLinkUrl } from '@shared/lib/link-url'
import { parseXPostUrl } from '@shared/lib/x-url'
import {
  createLink,
  ensureLabel,
  getLinkByNormalizedUrl,
  isUniqueViolation,
  linkExists,
  upsertLinkContent
} from '../data/link-repository'
import { findXPostLinkIdByTweetId } from '../data/x-post-repository'
import { outboxRepository } from '../data/outbox-store'
import { normalizeUrl } from '../data/url-normalizer'
import { getAuthState } from '../auth/auth-state'
import { store } from '../store/store'
import { type ExtractedContent } from './content-extractor'
import { createDrainGate } from './drain-gate'
import { fetchPageData } from './metadata-service'
import { computeBackoffDelay } from './outbox-backoff'
import { toQuickCaptureOutcome, type QuickCaptureDecision } from './quick-capture-outcome'
import { readerService } from './reader-instance'
import { isRealtimeActive } from './realtime-service'
import { validateUrl } from './url-validator'

export const MAX_OUTBOX_ATTEMPTS = 6

export interface CaptureResult {
  captured: boolean
  queued?: boolean
  retryable?: boolean
  reason?: string
}

export interface CaptureOptions {
  label?: string
  note?: string | null
}

export type PrepareResult =
  | { accepted: true; queued: true; item: OutboxItem; alreadyPending: boolean }
  | {
      accepted: false
      retryable: boolean
      code: 'invalid' | 'duplicate' | 'unauthenticated'
      reason: string
    }

/**
 * Owner of captures enqueued right now. `null` while no session is active, in
 * which case captures are refused: an unowned item has no safe account to drain
 * into and would otherwise leak into whichever user signs in next.
 */
function currentOwnerUserId(): string | null {
  const state = getAuthState()
  return state.status === 'authenticated' ? (state.user?.id ?? null) : null
}

/** Persisted-link event for kind-specific follow-up work (e.g. X post captures). */
export interface LinkPersistedEvent {
  id: string
  url: string
  kind: LinkKind
}

let linkPersistedHook: ((event: LinkPersistedEvent) => void) | null = null

/**
 * Registers kind-specific post-persist work. Hooks must not throw; a failing
 * hook must never fail or delay the capture that triggered it.
 */
export function setLinkPersistedHook(hook: ((event: LinkPersistedEvent) => void) | null): void {
  linkPersistedHook = hook
}

function notifyLinkPersisted(event: LinkPersistedEvent): void {
  try {
    linkPersistedHook?.(event)
  } catch {
    // Follow-up work is additive; capture success stands on its own.
  }
}

export function broadcastLinksChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC.links.changed)
  }
}

export function broadcastPendingChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC.links.pendingChanged)
  }
}

function showCaptureNotification(title: string): void {
  if (!store.get('notifyOnLinkCapture')) return
  if (!Notification.isSupported()) return
  new Notification({ title: 'Link saved', body: title }).show()
}

/** Notification for isolated-section capture results; same user preference. */
export function showSectionNotification(title: string, body: string): void {
  if (!store.get('notifyOnLinkCapture')) return
  if (!Notification.isSupported()) return
  new Notification({ title, body }).show()
}

function toOutboxError(error: unknown): OutboxError {
  if (error instanceof Error) return { code: 'CAPTURE_FAILED', message: error.message }
  return { code: 'CAPTURE_FAILED', message: String(error) }
}

export function toPendingCapture(item: OutboxItem): PendingCapture {
  return {
    id: item.id,
    url: item.url,
    label: item.label,
    status: item.status,
    attempts: item.attempts,
    lastError: item.lastError,
    createdAt: item.createdAt
  }
}

/**
 * Validates, dedupes and durably enqueues a capture. Network work is deliberately
 * excluded: enqueue is the durability boundary so an offline capture is never lost.
 */
export async function prepareCapture(
  rawUrl: string,
  options: CaptureOptions = {}
): Promise<PrepareResult> {
  const ownerUserId = currentOwnerUserId()
  if (!ownerUserId) {
    return {
      accepted: false,
      retryable: false,
      code: 'unauthenticated',
      reason: 'Sign in to save links.'
    }
  }

  const validation = validateUrl(rawUrl)
  if (!validation.valid) {
    return { accepted: false, retryable: false, code: 'invalid', reason: validation.reason }
  }

  const canonicalUrl = canonicalizeLinkUrl(validation.url)
  const normalizedUrl = normalizeUrl(canonicalUrl)
  const existing = outboxRepository.findByNormalizedUrl(normalizedUrl, ownerUserId)
  if (existing) {
    // A failed item is terminal; re-copying the URL should retry it instead of
    // claiming it "will sync automatically".
    if (existing.status === 'failed') {
      outboxRepository.requeue(existing.id)
      broadcastPendingChanged()
      return { accepted: true, queued: true, item: { ...existing, status: 'pending' }, alreadyPending: false }
    }
    return { accepted: true, queued: true, item: existing, alreadyPending: true }
  }

  try {
    if (await linkExists(canonicalUrl)) {
      return { accepted: false, retryable: false, code: 'duplicate', reason: 'duplicate' }
    }
    // Legacy rows may predate handle-free canonicalization; dedupe by tweet id
    // so a mirror of an already-captured post is never queued twice.
    const xPost = parseXPostUrl(canonicalUrl)
    if (xPost && (await findXPostLinkIdByTweetId(xPost.tweetId))) {
      return { accepted: false, retryable: false, code: 'duplicate', reason: 'duplicate' }
    }
  } catch {
    // Offline or transient failure: enqueue and let the drain re-check uniqueness.
  }

  const { item } = outboxRepository.enqueue({
    url: canonicalUrl,
    normalizedUrl,
    label: options.label ?? DEFAULT_LABEL,
    note: options.note ?? null,
    ownerUserId
  })
  broadcastPendingChanged()
  return { accepted: true, queued: true, item, alreadyPending: false }
}

/**
 * Fetches metadata and persists every due outbox item. Failures back off or, at
 * the attempt cap, are marked failed for explicit Retry/Discard. Idempotent:
 * a `23505` uniqueness violation means the link already exists, so the item clears.
 */
async function runDrainPass(): Promise<DrainSummary> {
  const summary: DrainSummary = { synced: 0, failed: 0, retried: 0 }
  const ownerUserId = currentOwnerUserId()
  if (!ownerUserId) return summary

  // Unowned items predate account scoping and cannot be attributed to anyone;
  // draining them now would write them into whichever account is signed in.
  if (outboxRepository.purgeOwner(null) > 0) broadcastPendingChanged()

  const due = outboxRepository
    .listDue()
    .filter((item) => item.ownerUserId === ownerUserId)
  if (due.length === 0) return summary

  // One notification per drain pass instead of one per synced link: a backlog
  // reconnecting after days offline must not fire dozens of OS toasts.
  const syncedTitles: string[] = []

  for (const item of due) {
    try {
      // X post pages are a login wall; their metadata comes from oEmbed and
      // their readable artifact is the local capture (see x-capture-service).
      const kind = classifyLinkKind(item.url)
      if (kind === 'x-post') {
        const parsed = parseXPostUrl(item.url)
        if (parsed) {
          try {
            if (await findXPostLinkIdByTweetId(parsed.tweetId)) {
              // A mirror of this post was already persisted (e.g. queued before
              // canonicalization); drop the duplicate instead of violating the
              // (user_id, tweet_id) constraint in the X side table.
              outboxRepository.remove(item.id)
              summary.synced += 1
              continue
            }
          } catch {
            // Transient lookup failure: fall through to the normal drain path.
          }
        }
      }
      const page = kind === 'x-post' ? null : await fetchPageData(item.url)
      const metadata = page?.metadata ?? null
      // A failed fetch must not be recorded as "this page has no article":
      // leave the content row absent so the reader can retry extraction later.
      const content: ExtractedContent | null =
        kind === 'x-post' || page?.fetchFailed
          ? null
          : (page?.content ?? {
              contentHtml: null,
              contentText: null,
              wordCount: 0,
              status: 'unsupported'
            })
      const label = await ensureLabel(item.label)

      let title = metadata?.title ?? null
      let linkId: string | null = null
      let createdLink: Link | null = null
      try {
        const link = await createLink({
          url: item.url,
          title: metadata?.title ?? null,
          description: metadata?.description ?? null,
          thumbnailUrl: metadata?.thumbnailUrl ?? null,
          author: metadata?.author ?? null,
          siteName: kind === 'x-post' ? 'X' : (metadata?.siteName ?? null),
          label,
          note: item.note,
          durationSeconds: metadata?.durationSeconds ?? null,
          channelUrl: metadata?.channelUrl ?? null
        })
        title = link.title
        linkId = link.id
        createdLink = link
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
        // The row already exists (a previous attempt committed, or another
        // device won the race): adopt its id so derived content still lands.
        const existing = await getLinkByNormalizedUrl(item.url)
        linkId = existing?.id ?? null
        createdLink = existing
      }

      if (linkId && content) {
        try {
          const extractedAt = new Date().toISOString()
          await upsertLinkContent(linkId, content, extractedAt)
          readerService.cacheContent(
            linkId,
            {
              linkId,
              contentHtml: content.contentHtml,
              contentText: content.contentText,
              wordCount: content.wordCount,
              extractionStatus: content.status,
              extractedAt
            },
            createdLink
          )
        } catch {
          // Reader content is derived; a write failure must not fail the capture.
        }
      }

      if (linkId) notifyLinkPersisted({ id: linkId, url: item.url, kind })

      outboxRepository.remove(item.id)
      summary.synced += 1
      // Realtime already broadcasts this row change; only broadcast directly
      // when the channel is unavailable, to avoid a duplicate refresh.
      if (!isRealtimeActive()) broadcastLinksChanged()
      // X posts have no title at persist time and get their own completion
      // notification once the capture (and its oEmbed metadata) is ready.
      if (kind !== 'x-post') syncedTitles.push(title ?? item.url)
    } catch (error) {
      const attempts = item.attempts + 1
      if (attempts >= MAX_OUTBOX_ATTEMPTS) {
        outboxRepository.markFailed(item.id, toOutboxError(error))
        summary.failed += 1
      } else {
        outboxRepository.markAttempt(item.id, Date.now() + computeBackoffDelay(attempts))
        summary.retried += 1
      }
    }
  }

  if (summary.synced + summary.failed + summary.retried > 0) broadcastPendingChanged()
  if (syncedTitles.length === 1) showCaptureNotification(syncedTitles[0])
  else if (syncedTitles.length > 1) {
    showCaptureNotification(`${syncedTitles.length} links saved`)
  }
  return summary
}

/**
 * Serialized entry point so the interval drainer, capture path and manual retry
 * never run overlapping passes. A request made mid-pass schedules one follow-up.
 */
export const drainOutbox = createDrainGate(runDrainPass)

export function listPendingCaptures(): PendingCapture[] {
  const ownerUserId = currentOwnerUserId()
  if (!ownerUserId) return []
  return outboxRepository
    .list()
    .filter((item) => item.ownerUserId === ownerUserId)
    .map(toPendingCapture)
}

/** Requeues failed items (one, or all when no id is given) and drains immediately. */
export async function retryPending(id?: string): Promise<DrainSummary> {
  const ownerUserId = currentOwnerUserId()
  if (!ownerUserId) return { synced: 0, failed: 0, retried: 0 }

  if (id) {
    const item = outboxRepository.get(id)
    if (item?.ownerUserId === ownerUserId) outboxRepository.requeue(id)
  } else {
    for (const item of outboxRepository.list()) {
      if (item.ownerUserId === ownerUserId && item.status === 'failed') {
        outboxRepository.requeue(item.id)
      }
    }
  }
  broadcastPendingChanged()
  return drainOutbox()
}

export function discardPending(id: string): void {
  const item = outboxRepository.get(id)
  if (!item || item.ownerUserId !== currentOwnerUserId()) return
  outboxRepository.remove(id)
  broadcastPendingChanged()
}

/** Capture orchestrator: enqueue durably, then attempt an immediate best-effort sync. */
export async function captureUrl(rawUrl: string): Promise<CaptureResult> {
  let prepared: PrepareResult
  try {
    prepared = await prepareCapture(rawUrl)
  } catch (error) {
    return { captured: false, retryable: true, reason: toOutboxError(error).message }
  }

  if (!prepared.accepted) {
    return { captured: false, retryable: prepared.retryable, reason: prepared.reason }
  }

  if (!prepared.alreadyPending) await drainOutbox()
  return { captured: true, queued: true, retryable: false }
}

/**
 * Annotated capture used by the quick-capture overlay. Reuses the same
 * validate/dedupe/outbox path as clipboard capture (AC6) and reports a
 * user-facing outcome the overlay can render.
 */
export async function quickCapture(
  rawUrl: string,
  options: CaptureOptions = {}
): Promise<QuickCaptureOutcome> {
  let prepared: PrepareResult
  try {
    prepared = await prepareCapture(rawUrl, options)
  } catch (error) {
    return { outcome: 'invalid', message: toOutboxError(error).message }
  }

  if (!prepared.accepted) {
    const decision: QuickCaptureDecision = {
      accepted: false,
      code: prepared.code,
      reason: prepared.reason
    }
    return toQuickCaptureOutcome({ decision, persisted: false, label: options.label ?? DEFAULT_LABEL })
  }

  let persisted = false
  if (!prepared.alreadyPending) {
    await drainOutbox()
    persisted = outboxRepository.get(prepared.item.id) === null
  }

  return toQuickCaptureOutcome({
    decision: { accepted: true, alreadyPending: prepared.alreadyPending },
    persisted,
    label: prepared.item.label
  })
}
