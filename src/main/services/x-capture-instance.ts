import { rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, app, nativeImage, shell } from 'electron'
import { IPC, type XCaptureStatus } from '@shared/contract/ipc'
import { enrichLinkMetadata, getLinkById } from '../data/link-repository'
import { xCaptureRepository } from '../data/x-capture-store'
import {
  ensureXPostRow,
  listXPostCaptureStates,
  listXPostLinks,
  updateXPostCaptureState,
  upsertXPostMetadata
} from '../data/x-post-repository'
import { drainOutbox, prepareCapture, setLinkPersistedHook, showSectionNotification } from './capture-service'
import { getAuthState } from '../auth/auth-state'
import { createXCaptureFiles, type XCaptureFiles } from './x-capture-files'
import { renderTweetCapture } from './x-capture-render'
import { createXCaptureService } from './x-capture-service'
import { createCaptureThumbnailCache } from './x-capture-thumbnail'
import { expandTcoLink } from './x-embed'
import { fetchXOEmbed } from './x-oembed-fetch'

/** Notifies every window that X section data changed. */
export function broadcastXChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC.x.changed)
  }
}

function tweetUrlFor(tweetId: string): string {
  return `https://x.com/i/status/${tweetId}`
}

/**
 * Signed-in account for local capture artifacts. Captures are stored per user
 * so switching accounts can never expose or sweep another user's PNGs.
 */
function currentOwnerUserId(): string | null {
  const state = getAuthState()
  return state.status === 'authenticated' ? (state.user?.id ?? null) : null
}

// Resolved lazily: the module is imported before `app.setPath('userData', ...)`
// runs (ES imports hoist), so the path must not be captured at import time.
const captureFilesByOwner = new Map<string, XCaptureFiles>()

function getCaptureFiles(): XCaptureFiles {
  const owner = currentOwnerUserId() ?? 'unauthenticated'
  let files = captureFilesByOwner.get(owner)
  if (!files) {
    files = createXCaptureFiles(join(app.getPath('userData'), 'x-captures', owner))
    captureFilesByOwner.set(owner, files)
  }
  return files
}

const thumbnailCache = createCaptureThumbnailCache((png, width) => {
  const image = nativeImage.createFromBuffer(png)
  if (image.isEmpty()) return null
  const { width: imageWidth } = image.getSize()
  const resized = imageWidth > width ? image.resize({ width }) : image
  return resized.toDataURL()
})

export function getXCaptureThumbnail(linkId: string): string | null {
  const files = getCaptureFiles()
  const stat = files.stat(linkId)
  if (!stat) return null
  return thumbnailCache.get({ linkId, mtimeMs: stat.mtimeMs }, () => files.read(linkId))
}

export function pruneXCaptureThumbnails(activeLinkIds: ReadonlySet<string>): void {
  thumbnailCache.prune(activeLinkIds)
}

/** Full-size data URL for the in-app preview; null when no capture exists. */
export function getXCaptureDataUrl(linkId: string): string | null {
  const png = getCaptureFiles().read(linkId)
  if (!png) return null
  const image = nativeImage.createFromBuffer(png)
  if (image.isEmpty()) return null
  return image.toDataURL()
}

export async function revealXCapture(linkId: string): Promise<void> {
  const files = getCaptureFiles()
  if (!files.exists(linkId)) throw new Error('Capture file not found.')
  shell.showItemInFolder(files.pathFor(linkId))
}

export async function openXCapture(linkId: string): Promise<void> {
  const files = getCaptureFiles()
  if (!files.exists(linkId)) throw new Error('Capture file not found.')
  const error = await shell.openPath(files.pathFor(linkId))
  if (error) throw new Error(error)
}

/** Deletes the local PNG for one post (the link and metadata stay). */
export function deleteXCapture(linkId: string): void {
  getCaptureFiles().remove(linkId)
  thumbnailCache.remove(linkId)
  broadcastXChanged()
}

/** Deletes local capture artifacts for links (files + pending jobs). */
export function removeXCaptures(linkIds: readonly string[]): void {
  if (linkIds.length === 0) return
  getCaptureFiles().removeMany(linkIds)
  for (const linkId of linkIds) thumbnailCache.remove(linkId)
  xCaptureRepository.removeMany(linkIds)
  broadcastXChanged()
}

/** Production X capture service, wired to the queue, Supabase, oEmbed and PNG storage. */
export const xCaptureService = createXCaptureService({
  repository: xCaptureRepository,
  getOwnerUserId: currentOwnerUserId,
  fetchOEmbed: (tweetId) => fetchXOEmbed(tweetId, tweetUrlFor(tweetId)),
  linkExists: async (linkId) => (await getLinkById(linkId)) !== null,
  renderCapture: (tweetId, post) =>
    renderTweetCapture(tweetId, post, { tempDirectory: getCaptureFiles().dir }),
  writeCapture: (linkId, png) => getCaptureFiles().write(linkId, png),
  expandLink: (url) => expandTcoLink(url),
  enqueueRelatedLink: async (url, label) => {
    await prepareCapture(url, { label })
    void drainOutbox()
  },
  upsertMetadata: upsertXPostMetadata,
  ensurePostRow: ensureXPostRow,
  updateCaptureState: updateXPostCaptureState,
  enrichLink: enrichLinkMetadata,
  notifyChanged: broadcastXChanged,
  notifyCapture: ({ author, text, ok }) => {
    if (ok) {
      const body = text?.split('\n')[0]?.trim().slice(0, 120) || 'Screenshot ready'
      showSectionNotification(author ? `X post by ${author}` : 'X post captured', body)
    } else {
      showSectionNotification('X post capture failed', 'Open the X section to retry.')
    }
  }
})

/** Connects persisted X post links to the capture queue (called once at boot). */
export function installXCapturePipeline(): void {
  setLinkPersistedHook((event) => {
    if (event.kind !== 'x-post') return
    xCaptureService.enqueue({ id: event.id, url: event.url })
  })
}

/** Deletes stale render artifacts and PNGs whose link no longer exists. */
function sweepOrphanCaptures(validIds: ReadonlySet<string>): void {
  const files = getCaptureFiles()
  let entries: string[]
  try {
    entries = readdirSync(files.dir)
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.endsWith('.tmp') || entry.startsWith('render-')) {
      try {
        rmSync(join(files.dir, entry), { force: true })
      } catch {
        // Temp artifact cleanup is best-effort.
      }
      continue
    }
    if (!entry.endsWith('.png')) continue

    const linkId = entry.slice(0, -4)
    if (!validIds.has(linkId)) {
      try {
        files.remove(linkId)
        thumbnailCache.remove(linkId)
      } catch {
        // A non-id filename cannot escape the capture directory; leave it.
      }
    }
  }
}

const RECONCILE_MAX_ENQUEUES = 10

/**
 * Boot reconciliation between persisted X posts and the local capture queue:
 * drops jobs for deleted links, heals jobs lost to a crash, adopts existing
 * PNGs whose state was lost, and sweeps orphaned files. Enqueues are bounded
 * so a first run on a synced account cannot render dozens of posts at once.
 */
export async function reconcileXCaptures(): Promise<void> {
  // No session: reconciliation would sweep another account's artifacts.
  if (!currentOwnerUserId()) return

  let links: Awaited<ReturnType<typeof listXPostLinks>>
  let states: Map<string, XCaptureStatus>
  try {
    links = await listXPostLinks()
  } catch {
    // Offline: reconciliation runs again next boot.
    return
  }
  try {
    states = await listXPostCaptureStates()
  } catch {
    states = new Map()
  }

  const validIds = new Set(links.map((link) => link.id))
  sweepOrphanCaptures(validIds)

  const files = getCaptureFiles()
  let enqueued = 0

  for (const link of links) {
    if (xCaptureService.repository.get(link.id)) continue

    if (files.exists(link.id)) {
      // The PNG survived but the server state did not; adopt it locally.
      if (states.get(link.id) !== 'ok') {
        try {
          await updateXPostCaptureState(link.id, {
            status: 'ok',
            error: null,
            capturedAt: new Date().toISOString()
          })
        } catch {
          // State healing is best-effort.
        }
      }
      continue
    }

    const status = states.get(link.id)
    // Terminal/remote states are left alone: 'ok' captures live on another
    // device (capture on demand), 'failed' has an explicit Retry in the UI.
    if (status === 'ok' || status === 'failed') continue
    if (enqueued >= RECONCILE_MAX_ENQUEUES) break
    if (xCaptureService.enqueue({ id: link.id, url: link.url })) enqueued += 1
  }
}
