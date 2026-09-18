import {
  DEFAULT_LABEL,
  ExtractionStatusSchema,
  LinkKindSchema,
  type ExtractionStatus,
  type Link,
  type LinkKind
} from '@shared/contract/ipc'
import { readingTimeMinutes } from '@shared/lib/format'
import { canonicalizeLinkUrl, classifyLinkKind } from '@shared/lib/link-url'

export interface LinkContentEmbed {
  word_count: number | null
  extraction_status: string | null
}

export interface LinkRow {
  id: string
  url: string
  title: string | null
  description: string | null
  thumbnail_url: string | null
  author: string | null
  site_name: string | null
  label: string | null
  note: string | null
  /** Optional so pre-migration rows still map. */
  kind?: string | null
  is_read: boolean | null
  is_archived: boolean | null
  created_at: string | null
  updated_at: string | null
  user_id: string | null
  link_content?: LinkContentEmbed | LinkContentEmbed[] | null
  word_count?: number | null
  extraction_status?: string | null
  matched_in_content?: boolean | null
  duration_seconds?: number | null
  channel_url?: string | null
  origin?: string | null
  playlist_id?: string | null
}

function parseDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function normalizeLabel(label: string | null | undefined): string {
  const trimmed = (label ?? '').trim()
  return trimmed.length > 0 ? trimmed : DEFAULT_LABEL
}

function parseExtractionStatus(value: string | null | undefined): ExtractionStatus {
  const parsed = ExtractionStatusSchema.safeParse(value)
  return parsed.success ? parsed.data : 'none'
}

function parseLinkKind(value: string | null | undefined): LinkKind {
  const parsed = LinkKindSchema.safeParse(value)
  return parsed.success ? parsed.data : 'link'
}

function contentMeta(row: LinkRow): { wordCount: number | null; status: ExtractionStatus } {
  const embed = Array.isArray(row.link_content) ? row.link_content[0] : row.link_content
  const rawWordCount = row.word_count ?? embed?.word_count ?? null
  const status = parseExtractionStatus(row.extraction_status ?? embed?.extraction_status)
  return { wordCount: typeof rawWordCount === 'number' ? rawWordCount : null, status }
}

export function mapLinkRow(row: LinkRow): Link {
  if (typeof row.id !== 'string' || typeof row.url !== 'string') {
    throw new Error('Invalid link row: id and url are required')
  }
  const meta = contentMeta(row)
  return {
    id: row.id,
    url: row.url,
    title: row.title ?? null,
    description: row.description ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    author: row.author ?? null,
    siteName: row.site_name ?? null,
    label: normalizeLabel(row.label),
    kind: parseLinkKind(row.kind),
    isRead: row.is_read === true,
    isArchived: row.is_archived === true,
    note: row.note ?? null,
    createdAt: parseDate(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: parseDate(row.updated_at),
    userId: row.user_id ?? null,
    wordCount: meta.wordCount,
    readingTimeMinutes: readingTimeMinutes(meta.wordCount),
    extractionStatus: meta.status,
    matchedInContent: row.matched_in_content === true ? true : undefined,
    durationSeconds: typeof row.duration_seconds === 'number' ? row.duration_seconds : null,
    channelUrl: row.channel_url ?? null,
    origin: row.origin ?? null,
    playlistId: row.playlist_id ?? null
  }
}

export interface LinkPatchLike {
  url?: string
  title?: string | null
  description?: string | null
  thumbnailUrl?: string | null
  author?: string | null
  siteName?: string | null
  label?: string | null
  note?: string | null
  isRead?: boolean
  isArchived?: boolean
  durationSeconds?: number | null
  channelUrl?: string | null
}

export function buildLinkUpdatePayload(patch: LinkPatchLike): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (patch.url !== undefined) {
    // A URL edit can move a link between the library and an isolated section;
    // kind must always track the stored URL.
    const url = canonicalizeLinkUrl(patch.url)
    payload.url = url
    payload.kind = classifyLinkKind(url)
  }
  if (patch.title !== undefined) payload.title = patch.title
  if (patch.description !== undefined) payload.description = patch.description
  if (patch.thumbnailUrl !== undefined) payload.thumbnail_url = patch.thumbnailUrl
  if (patch.author !== undefined) payload.author = patch.author
  if (patch.siteName !== undefined) payload.site_name = patch.siteName
  if (patch.label !== undefined) payload.label = normalizeLabel(patch.label)
  if (patch.note !== undefined) payload.note = patch.note
  if (patch.isRead !== undefined) payload.is_read = patch.isRead
  if (patch.isArchived !== undefined) payload.is_archived = patch.isArchived
  if (patch.durationSeconds !== undefined) payload.duration_seconds = patch.durationSeconds
  if (patch.channelUrl !== undefined) payload.channel_url = patch.channelUrl
  return payload
}

export function mapLinkRows(rows: readonly LinkRow[]): Link[] {
  const links: Link[] = []
  for (const row of rows) {
    try {
      links.push(mapLinkRow(row))
    } catch {
      // Skip malformed rows instead of failing the whole page.
    }
  }
  return links
}


