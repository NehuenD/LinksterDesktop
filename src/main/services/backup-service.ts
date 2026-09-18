import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, dialog } from 'electron'
import type {
  BackupPreferences,
  BackupResult,
  RestoreMode,
  RestorePreview,
  RestoreSummary
} from '@shared/contract/ipc'
import { canonicalizeLinkUrl } from '@shared/lib/link-url'
import { listLabels, setLabelColorRecord } from '../data/label-repository'
import {
  bulkInsertLinks,
  ensureLabel,
  listAllLinkContents,
  listAllLinks,
  upsertLinkContent,
  updateLink,
  type NewLinkRecord
} from '../data/link-repository'
import {
  listAllXPostMetadata,
  resolveXRelatedLinks,
  restoreXPostMetadata
} from '../data/x-post-repository'
import { normalizeUrl } from '../data/url-normalizer'
import { store } from '../store/store'
import { getLabelColors } from './label-color-service'
import {
  BACKUP_FILE_PREFIX,
  BACKUP_FORMAT_VERSION,
  parseBackup,
  serializeBackup,
  toBackupLink,
  type BackupContent,
  type BackupFile,
  type BackupXPost
} from './backup-format'
import { readerService } from './reader-instance'
import { parseExtractionStatus } from './reader-service'
import { applyStoredMonitoringPreference } from './clipboard-controller'
import { applyStoredQuickCapturePreference } from './hotkey-service'
import { applyThemeMode, getThemeMode } from './theme-service'

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

export function defaultBackupDirectory(): string {
  return join(app.getPath('documents'), 'Linkster')
}

function readPreferences(): BackupPreferences {
  return {
    themeMode: store.get('themeMode'),
    clipboardMonitoring: store.get('clipboardMonitoring'),
    notifyOnLinkCapture: store.get('notifyOnLinkCapture'),
    notifyOnScreenshot: store.get('notifyOnScreenshot'),
    quickCaptureEnabled: store.get('quickCaptureEnabled'),
    quickCaptureHotkey: store.get('quickCaptureHotkey')
  }
}

interface CreateBackupOptions {
  includeContent?: boolean
  targetDir?: string
}

export async function createBackup(options: CreateBackupOptions = {}): Promise<BackupResult> {
  const includeContent = options.includeContent !== false

  const links = await listAllLinks()
  const labels = await listLabels()
  const contentRows = includeContent ? await listAllLinkContents() : []
  const xPostRows = await listAllXPostMetadata()

  const contents: BackupContent[] = contentRows.map((row) => ({
    linkId: row.link_id,
    contentHtml: row.content_html,
    contentText: row.content_text,
    wordCount: row.word_count,
    extractionStatus: parseExtractionStatus(row.extraction_status),
    extractedAt: row.extracted_at
  }))

  const xPosts: BackupXPost[] = xPostRows.map((row) => ({
    linkId: row.link_id,
    tweetId: row.tweet_id,
    authorHandle: row.author_handle,
    authorName: row.author_name,
    text: row.text,
    postedAt: row.posted_at,
    relatedUrl: row.related_url
  }))

  const file: BackupFile = {
    manifest: {
      app: 'linkster',
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      counts: { links: links.length, labels: labels.length, contents: contents.length }
    },
    labels,
    labelColors: await getLabelColors(),
    preferences: readPreferences(),
    links: links.map(toBackupLink),
    contents,
    xPosts
  }

  const directory = options.targetDir ?? defaultBackupDirectory()
  await mkdir(directory, { recursive: true })
  const path = join(directory, `${BACKUP_FILE_PREFIX}${timestamp()}.json`)
  const content = serializeBackup(file)
  // Write to a temp file and rename so a crash/disk-full cannot leave a
  // truncated file with a valid backup name.
  const tempPath = `${path}.tmp`
  await writeFile(tempPath, content, 'utf8')
  await rename(tempPath, path)
  store.set('lastBackupAt', file.manifest.createdAt)

  return { path, counts: file.manifest.counts, bytes: Buffer.byteLength(content, 'utf8') }
}

export async function pickBackupFile(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Restore from backup',
    properties: ['openFile'],
    filters: [{ name: 'Linkster backup', extensions: ['json'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

async function readBackup(path: string): Promise<BackupFile> {
  const raw = await readFile(path, 'utf8')
  const parsed = parseBackup(raw)
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.file
}

/** Dedupe key shared by backup matching and restore, canonicalizing section URLs. */
function restoreKey(url: string): string {
  return normalizeUrl(canonicalizeLinkUrl(url))
}

function existingIdByUrl(links: readonly { id: string; url: string }[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const link of links) map.set(restoreKey(link.url), link.id)
  return map
}

export async function previewRestore(path: string): Promise<RestorePreview> {
  const file = await readBackup(path)
  const existing = existingIdByUrl(await listAllLinks())

  let newLinks = 0
  let conflicts = 0
  const seen = new Set<string>()
  for (const link of file.links) {
    const key = restoreKey(link.url)
    if (existing.has(key) || seen.has(key)) {
      conflicts += 1
      continue
    }
    seen.add(key)
    newLinks += 1
  }

  return { path, manifest: file.manifest, newLinks, conflicts }
}

export async function runRestore(path: string, mode: RestoreMode): Promise<RestoreSummary> {
  const file = await readBackup(path)
  const before = await listAllLinks()
  const existing = existingIdByUrl(before)

  for (const label of file.labels) {
    await ensureLabel(label)
  }

  const toInsert: NewLinkRecord[] = []
  const seen = new Set<string>()
  // URLs that already existed before this restore: in merge mode their local
  // metadata AND reader content stay untouched.
  const preExistingKeys = new Set(existing.keys())
  let skipped = 0
  let conflicted = 0

  for (const link of file.links) {
    const key = restoreKey(link.url)
    const existingId = existing.get(key)

    if (existingId) {
      if (mode === 'replace') {
        conflicted += 1
        await updateLink(existingId, {
          title: link.title,
          description: link.description,
          thumbnailUrl: link.thumbnailUrl,
          author: link.author,
          siteName: link.siteName,
          label: link.label,
          note: link.note,
          isRead: link.isRead,
          isArchived: link.isArchived,
          durationSeconds: link.durationSeconds ?? null,
          channelUrl: link.channelUrl ?? null
        })
      } else {
        skipped += 1
      }
      continue
    }

    if (seen.has(key)) {
      conflicted += 1
      skipped += 1
      continue
    }

    seen.add(key)
    toInsert.push({
      id: link.id,
      url: link.url,
      title: link.title,
      description: link.description,
      thumbnailUrl: link.thumbnailUrl,
      author: link.author,
      siteName: link.siteName,
      label: link.label,
      note: link.note,
      isRead: link.isRead,
      isArchived: link.isArchived,
      createdAt: link.createdAt,
      durationSeconds: link.durationSeconds ?? null,
      channelUrl: link.channelUrl ?? null
    })
  }

  const inserted = await bulkInsertLinks(toInsert)

  // Rebuild the url → server id map so reader content follows preserved/remapped ids.
  const after = await listAllLinks()
  const finalIdByUrl = existingIdByUrl(after)
  const urlByBackupId = new Map(file.links.map((link) => [link.id, link.url]))

  let contents = 0
  for (const content of file.contents) {
    const url = urlByBackupId.get(content.linkId)
    if (!url) continue
    const key = restoreKey(url)
    const finalId = finalIdByUrl.get(key)
    if (!finalId) continue
    // Merge keeps existing rows unchanged — including their (possibly newer)
    // reader content. Replace overwrites intentionally.
    if (mode === 'merge' && preExistingKeys.has(key)) continue

    const extractedAt = content.extractedAt ?? new Date().toISOString()
    try {
      await upsertLinkContent(
        finalId,
        {
          contentHtml: content.contentHtml,
          contentText: content.contentText,
          wordCount: content.wordCount,
          status: content.extractionStatus
        },
        extractedAt
      )
      readerService.cacheContent(finalId, {
        linkId: finalId,
        contentHtml: content.contentHtml,
        contentText: content.contentText,
        wordCount: content.wordCount,
        extractionStatus: content.extractionStatus,
        extractedAt
      })
      contents += 1
    } catch {
      // Reader content is derived; a restore failure must not fail the whole restore.
    }
  }

  let xPosts = 0
  for (const xPost of file.xPosts ?? []) {
    const url = urlByBackupId.get(xPost.linkId)
    if (!url) continue
    const finalId = finalIdByUrl.get(restoreKey(url))
    if (!finalId) continue

    try {
      await restoreXPostMetadata({ ...xPost, linkId: finalId })
      xPosts += 1
    } catch {
      // Tweet metadata is best-effort; the link itself already restored.
    }
  }
  if (xPosts > 0) {
    try {
      await resolveXRelatedLinks()
    } catch {
      // Related links resolve again on the next X section load.
    }
  }

  const currentColors = await getLabelColors()
  const mergedColors =
    mode === 'replace'
      ? { ...currentColors, ...file.labelColors }
      : { ...file.labelColors, ...currentColors }
  store.set('labelColors', mergedColors)
  // Push the backup's winning colors to the labels table so they sync.
  for (const [name, color] of Object.entries(file.labelColors)) {
    if (mergedColors[name] !== color) continue
    try {
      await setLabelColorRecord(name, color)
    } catch {
      // A color write must not fail the whole restore.
    }
  }

  if (mode === 'replace') {
    store.set('themeMode', file.preferences.themeMode)
    store.set('clipboardMonitoring', file.preferences.clipboardMonitoring)
    store.set('notifyOnLinkCapture', file.preferences.notifyOnLinkCapture)
    store.set('notifyOnScreenshot', file.preferences.notifyOnScreenshot)
    store.set('quickCaptureEnabled', file.preferences.quickCaptureEnabled)
    store.set('quickCaptureHotkey', file.preferences.quickCaptureHotkey)
    // Apply through the owning services so the running app (native theme,
    // clipboard watcher, registered shortcut) picks the restored values up
    // without a restart.
    applyThemeMode(getThemeMode())
    applyStoredMonitoringPreference()
    applyStoredQuickCapturePreference()
  }

  return {
    mode,
    total: file.links.length,
    added: inserted.added,
    skipped: skipped + inserted.skipped,
    conflicted,
    failed: inserted.failed,
    labels: new Set(file.labels).size,
    contents
  }
}
