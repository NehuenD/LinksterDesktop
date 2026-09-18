import {
  DEFAULT_LABEL,
  type ImportOptions,
  type ImportRecord,
  type ImportSource
} from '@shared/contract/ipc'
import { normalizeLabel } from '../data/link-mapper'
import { validateUrl } from './url-validator'
import type { BookmarkEntry } from './bookmarks-html-parser'
import { getField, type CsvRow } from './csv'

export interface ImportRecordFlags {
  isRead?: boolean
  isArchived?: boolean
  createdAt?: string | null
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function toIso(value: unknown): string | null {
  const text = asString(value)
  if (!text) return null
  const trimmed = text.trim()
  if (trimmed.length === 0) return null
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed)
    const milliseconds = trimmed.length <= 10 ? numeric * 1000 : numeric
    const date = new Date(milliseconds)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function firstTag(raw: unknown): string | null {
  const text = asString(raw)
  if (!text) return null
  const tag = text.split(/[|,]/)[0]?.trim() ?? ''
  return tag.length > 0 ? tag : null
}

function labelFor(raw: unknown, fallback: string): string {
  const text = asString(raw)
  if (text && text.trim().length > 0) return normalizeLabel(text)
  return fallback
}

function makeRecord(
  rawUrl: unknown,
  rawTitle: unknown,
  rawLabel: unknown,
  source: ImportSource,
  flags: ImportRecordFlags,
  defaultLabel: string
): ImportRecord | null {
  const url = asString(rawUrl)
  if (!url) return null
  const validation = validateUrl(url)
  if (!validation.valid) return null

  const title = asString(rawTitle)

  return {
    url: validation.url,
    title: title && title.trim().length > 0 ? title.trim() : null,
    label: labelFor(rawLabel, defaultLabel),
    isRead: flags.isRead ?? false,
    isArchived: flags.isArchived ?? false,
    createdAt: toIso(flags.createdAt ?? null),
    source
  }
}

function defaultLabelOf(options: ImportOptions | undefined): string {
  const value = options?.defaultLabel?.trim()
  return value && value.length > 0 ? normalizeLabel(value) : DEFAULT_LABEL
}

export function mapBookmarks(
  entries: readonly BookmarkEntry[],
  options?: ImportOptions
): ImportRecord[] {
  const fallback = defaultLabelOf(options)
  const records: ImportRecord[] = []
  for (const entry of entries) {
    const folder = entry.folderPath[entry.folderPath.length - 1] ?? null
    const record = makeRecord(entry.url, entry.title, folder, 'bookmarks-html', {}, fallback)
    if (record) records.push(record)
  }
  return records
}

export function mapPocket(rows: readonly CsvRow[], options?: ImportOptions): ImportRecord[] {
  const fallback = defaultLabelOf(options)
  const records: ImportRecord[] = []
  for (const row of rows) {
    const archived = (getField(row, 'status') ?? '').toLowerCase() === 'archive'
    const record = makeRecord(
      getField(row, 'url'),
      getField(row, 'title'),
      firstTag(getField(row, 'tags')),
      'pocket',
      { isRead: archived, isArchived: archived, createdAt: getField(row, 'time_added') },
      fallback
    )
    if (record) records.push(record)
  }
  return records
}

export function mapInstapaper(rows: readonly CsvRow[], options?: ImportOptions): ImportRecord[] {
  const fallback = defaultLabelOf(options)
  const records: ImportRecord[] = []
  for (const row of rows) {
    const record = makeRecord(
      getField(row, 'url'),
      getField(row, 'title'),
      getField(row, 'folder'),
      'instapaper',
      { createdAt: getField(row, 'timestamp') },
      fallback
    )
    if (record) records.push(record)
  }
  return records
}

export function mapRaindrop(rows: readonly CsvRow[], options?: ImportOptions): ImportRecord[] {
  const fallback = defaultLabelOf(options)
  const records: ImportRecord[] = []
  for (const row of rows) {
    const folder = getField(row, 'folder')
    const record = makeRecord(
      getField(row, 'url'),
      getField(row, 'title'),
      folder ?? firstTag(getField(row, 'tags')),
      'raindrop',
      { createdAt: getField(row, 'created') },
      fallback
    )
    if (record) records.push(record)
  }
  return records
}

export function mapRaindropJson(input: unknown, options?: ImportOptions): ImportRecord[] {
  const fallback = defaultLabelOf(options)
  const items = Array.isArray(input)
    ? input
    : input && typeof input === 'object' && Array.isArray((input as { items?: unknown }).items)
      ? ((input as { items: unknown[] }).items)
      : []
  const records: ImportRecord[] = []

  for (const rawItem of items) {
    // One malformed row must be skipped, never abort the whole import.
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue
    const item = rawItem as Record<string, unknown>
    const type = asString(item.type)
    if (type && type !== 'link') continue

    const rawTags = item.tags
    const tags = Array.isArray(rawTags)
      ? rawTags.filter((tag): tag is string => typeof tag === 'string').join(',')
      : asString(rawTags)
    const collection =
      item.collection && typeof item.collection === 'object' && !Array.isArray(item.collection)
        ? (item.collection as Record<string, unknown>)
        : null

    const record = makeRecord(
      item.link ?? item.url ?? null,
      item.title ?? null,
      collection?.title ?? firstTag(tags),
      'raindrop',
      { createdAt: asString(item.created) },
      fallback
    )
    if (record) records.push(record)
  }
  return records
}

export function detectSource(fileName: string, head: string): ImportSource | 'auto' {
  const lower = fileName.toLowerCase()
  const probe = head.toLowerCase()

  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'bookmarks-html'
  if (lower.includes('linkster') || probe.includes('"formatversion"')) return 'linkster-backup'
  if (lower.endsWith('.json')) return 'raindrop'
  if (probe.includes('time_added') || lower.includes('pocket')) return 'pocket'
  if (probe.includes('selection') || lower.includes('instapaper')) return 'instapaper'
  if (probe.includes('excerpt') || probe.includes('highlights') || lower.includes('raindrop')) {
    return 'raindrop'
  }
  return 'auto'
}
