import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import {
  DEFAULT_LABEL,
  IPC,
  type ImportOptions,
  type ImportPreview,
  type ImportProgress,
  type ImportRecord,
  type ImportSource,
  type ImportSummary
} from '@shared/contract/ipc'
import { canonicalizeLinkUrl } from '@shared/lib/link-url'
import {
  bulkInsertLinks,
  ensureLabel,
  listAllNormalizedUrls,
  type NewLinkRecord
} from '../data/link-repository'
import { normalizeUrl } from '../data/url-normalizer'
import { parseBookmarksHtml } from './bookmarks-html-parser'
import { parseCsv } from './csv'
import {
  detectSource,
  mapBookmarks,
  mapInstapaper,
  mapPocket,
  mapRaindrop,
  mapRaindropJson
} from './import-mapper'

interface ParsedImport {
  source: ImportSource
  records: ImportRecord[]
  rawCount: number
}

let activeController: AbortController | null = null

function broadcastProgress(progress: ImportProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC.data.importProgress, progress)
  }
}

export async function pickImportFile(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Import links',
    properties: ['openFile'],
    filters: [
      { name: 'All supported', extensions: ['html', 'htm', 'csv', 'json'] },
      { name: 'Bookmarks HTML', extensions: ['html', 'htm'] },
      { name: 'CSV', extensions: ['csv'] },
      { name: 'JSON', extensions: ['json'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

/**
 * Decodes an import file with BOM detection. Legacy bookmark exports are often
 * UTF-16; reading them as UTF-8 silently yields zero parsed entries.
 */
function decodeImportBuffer(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2))
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(2))
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer.subarray(3))
  }
  return new TextDecoder('utf-8').decode(buffer)
}

async function parseImportFile(path: string, options: ImportOptions): Promise<ParsedImport> {
  const text = decodeImportBuffer(await readFile(path))
  const resolved =
    options.source === 'auto' ? detectSource(basename(path), text.slice(0, 4096)) : options.source

  if (resolved === 'auto') {
    throw new Error('Could not detect the import format. Choose a source and try again.')
  }
  if (resolved === 'linkster-backup') {
    throw new Error('This looks like a Linkster backup. Use Restore instead of Import.')
  }

  if (resolved === 'bookmarks-html') {
    const entries = parseBookmarksHtml(text)
    return {
      source: resolved,
      records: mapBookmarks(entries, options),
      rawCount: entries.length
    }
  }

  if (resolved === 'raindrop' && path.toLowerCase().endsWith('.json')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      throw new Error('The JSON file could not be parsed.')
    }
    const records = mapRaindropJson(parsed, options)
    return {
      source: resolved,
      records,
      rawCount: Array.isArray(parsed)
        ? parsed.length
        : Array.isArray((parsed as { items?: unknown })?.items)
          ? ((parsed as { items: unknown[] }).items.length)
          : 0
    }
  }

  const { rows } = parseCsv(text)
  const records =
    resolved === 'pocket'
      ? mapPocket(rows, options)
      : resolved === 'instapaper'
        ? mapInstapaper(rows, options)
        : mapRaindrop(rows, options)
  return { source: resolved, records, rawCount: rows.length }
}

/** Import dedupe key: section URLs canonicalize the same way the store does. */
function importKey(url: string): string {
  return normalizeUrl(canonicalizeLinkUrl(url))
}

function duplicateCount(records: readonly ImportRecord[], existing: ReadonlySet<string>): number {
  const seen = new Set<string>()
  let duplicates = 0
  for (const record of records) {
    const key = importKey(record.url)
    if (existing.has(key) || seen.has(key)) {
      duplicates += 1
      continue
    }
    seen.add(key)
  }
  return duplicates
}

export async function previewImport(
  path: string,
  options: ImportOptions = { source: 'auto' }
): Promise<ImportPreview> {
  const parsed = await parseImportFile(path, options)
  const existing = await listAllNormalizedUrls()

  return {
    source: parsed.source,
    path,
    total: parsed.records.length,
    duplicates: duplicateCount(parsed.records, existing),
    invalid: Math.max(0, parsed.rawCount - parsed.records.length),
    sample: parsed.records.slice(0, 10).map((record) => ({
      title: record.title,
      url: record.url,
      label: record.label
    }))
  }
}

function toNewLinkRecord(record: ImportRecord, defaultLabel: string): NewLinkRecord {
  return {
    url: record.url,
    title: record.title,
    description: null,
    thumbnailUrl: null,
    author: null,
    siteName: null,
    label: record.label || defaultLabel,
    note: null,
    isRead: record.isRead,
    isArchived: record.isArchived,
    ...(record.createdAt ? { createdAt: record.createdAt } : {})
  }
}

export async function runImport(
  path: string,
  options: ImportOptions = { source: 'auto' }
): Promise<ImportSummary> {
  if (activeController) throw new Error('An import is already running.')

  const controller = new AbortController()
  activeController = controller

  try {
    broadcastProgress({ phase: 'parsing', processed: 0, total: 0, added: 0, skipped: 0, failed: 0 })
    const parsed = await parseImportFile(path, options)
    const existing = await listAllNormalizedUrls()
    const duplicates = duplicateCount(parsed.records, existing)

    let pending = parsed.records
    if (options.skipDuplicates !== false) {
      const seen = new Set<string>()
      pending = pending.filter((record) => {
        const key = importKey(record.url)
        if (existing.has(key) || seen.has(key)) return false
        seen.add(key)
        return true
      })
    }

    const labels = [...new Set(pending.map((record) => record.label))]
    for (const label of labels) {
      await ensureLabel(label)
    }

    const records = pending.map((record) => toNewLinkRecord(record, DEFAULT_LABEL))
    const total = records.length

    broadcastProgress({
      phase: 'writing',
      processed: 0,
      total,
      added: 0,
      skipped: 0,
      failed: 0
    })

    const result = await bulkInsertLinks(records, {
      signal: controller.signal,
      onProgress: (progress) => {
        broadcastProgress({ phase: 'writing', total, ...progress })
      }
    })

    const summary: ImportSummary = {
      phase: 'done',
      source: parsed.source,
      total: parsed.records.length,
      processed: result.processed,
      added: result.added,
      // Duplicates only count as skipped when they were actually filtered out;
      // with skipDuplicates disabled they were inserted and reported as added.
      skipped: (options.skipDuplicates === false ? 0 : duplicates) + result.skipped,
      failed: result.failed,
      cancelled: result.cancelled,
      duplicates,
      invalid: Math.max(0, parsed.rawCount - parsed.records.length)
    }
    broadcastProgress(summary)
    return summary
  } finally {
    activeController = null
  }
}

export function cancelImport(): void {
  activeController?.abort()
}
