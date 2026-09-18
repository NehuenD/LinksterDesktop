import { randomUUID } from 'node:crypto'
import {
  DEFAULT_PAGE_SIZE,
  LinkKindSchema,
  type CreateLinkInput,
  type ExtractionStatus,
  type Link,
  type LinkKind,
  type LinkQuery,
  type LinkSort,
  type LinkStats,
  type MarkAllReadResult,
  type RestoreLinkInput,
  type RestoreResult,
  type UpdateLinkPatch
} from '@shared/contract/ipc'
import { supabase } from '../auth/supabase'
import {
  buildLinkUpdatePayload,
  mapLinkRow,
  mapLinkRows,
  normalizeLabel,
  type LinkRow
} from './link-mapper'
import { normalizeUrl } from './url-normalizer'
import { canonicalizeLinkUrl, classifyLinkKind } from '@shared/lib/link-url'
import { parseYouTubeVideoUrl } from '@shared/lib/youtube-url'
import { DatabaseError, dbErrorMessage, isUniqueViolation } from './db-error'

export { DatabaseError, isUniqueViolation } from './db-error'

const LINK_COLUMNS =
  'id,url,title,description,thumbnail_url,author,site_name,label,note,kind,is_read,is_archived,created_at,updated_at,user_id,duration_seconds,channel_url,origin,playlist_id,link_content(word_count,extraction_status)'

function escapeSearchTerm(value: string): string {
  return value.replace(/[\\%_(),]/g, (match) => `\\${match}`)
}

interface SortOrder {
  column: string
  ascending: boolean
  nullsFirst?: boolean
}

const SORT_ORDERS: Record<LinkSort, SortOrder> = {
  newest: { column: 'created_at', ascending: false },
  oldest: { column: 'created_at', ascending: true },
  title: { column: 'title', ascending: true, nullsFirst: false },
  // There is no domain column; the normalized URL starts with scheme://host, so
  // ordering by URL groups same-domain links together server-side.
  domain: { column: 'url', ascending: true, nullsFirst: false }
}

async function searchLinks(query: LinkQuery, term: string): Promise<Link[]> {
  const { data, error } = await supabase.rpc('search_links', {
    p_term: term,
    p_filter: query.filter ?? 'all',
    p_label: query.label ?? null,
    p_domain: query.domain?.trim() || null,
    p_date_from: query.dateFrom ?? null,
    p_date_to: query.dateTo ?? null,
    p_include_content: query.searchContent ?? true,
    p_sort: query.sort ?? 'newest',
    p_limit: query.limit ?? DEFAULT_PAGE_SIZE,
    p_offset: query.offset ?? 0,
    p_kind: query.kind ?? 'link'
  })
  if (error) throw new Error(dbErrorMessage(error))
  return mapLinkRows(data as LinkRow[])
}

export async function listLinks(query: LinkQuery = {}): Promise<Link[]> {
  const search = query.search?.trim() ?? ''
  if (search.length > 0) return searchLinks(query, search)

  const order = SORT_ORDERS[query.sort ?? 'newest']
  let request = supabase
    .from('links')
    .select(LINK_COLUMNS)
    .order(order.column, { ascending: order.ascending, nullsFirst: order.nullsFirst })
    // Unique tiebreaker: offset pagination over a non-unique sort key can
    // repeat or skip rows when timestamps tie (bulk inserts share now()).
    .order('id', { ascending: true })

  if (query.filter === 'unread') {
    request = request.eq('is_read', false).eq('is_archived', false)
  }
  if (query.filter === 'archived') request = request.eq('is_archived', true)
  if (query.label) request = request.eq('label', query.label)

  const kind = query.kind ?? 'link'
  if (kind !== 'all') request = request.eq('kind', kind)

  const domain = query.domain?.trim() ?? ''
  if (domain.length > 0) {
    request = request.ilike('url', `%${escapeSearchTerm(domain)}%`)
  }

  if (query.dateFrom) request = request.gte('created_at', query.dateFrom)
  if (query.dateTo) request = request.lte('created_at', query.dateTo)

  if (query.limit !== undefined) {
    const offset = query.offset ?? 0
    request = request.range(offset, offset + query.limit - 1)
  }

  const { data, error } = await request
  if (error) throw new Error(dbErrorMessage(error))
  return mapLinkRows(data as LinkRow[])
}

interface LinkStatsRow {
  total: number | string | null
  unread: number | string | null
  archived: number | string | null
  by_label: Record<string, number> | null
  x_posts: number | string | null
  youtube: number | string | null
  x_posts_unread: number | string | null
  youtube_unwatched: number | string | null
}

/**
 * Counts are computed by the `link_stats` RPC in Postgres (RLS-scoped), so a
 * large library is never downloaded to count it. X posts and YouTube videos are
 * counted separately and excluded from the library totals.
 */
export async function getLinkStats(): Promise<LinkStats> {
  const { data, error } = await supabase.rpc('link_stats')
  if (error) throw new Error(dbErrorMessage(error))

  const row = (Array.isArray(data) ? data[0] : data) as LinkStatsRow | null | undefined
  if (!row) {
    return {
      total: 0,
      unread: 0,
      archived: 0,
      byLabel: {},
      xPosts: 0,
      youtube: 0,
      xPostsUnread: 0,
      youtubeUnwatched: 0
    }
  }

  return {
    total: Number(row.total ?? 0),
    unread: Number(row.unread ?? 0),
    archived: Number(row.archived ?? 0),
    byLabel: row.by_label ?? {},
    xPosts: Number(row.x_posts ?? 0),
    youtube: Number(row.youtube ?? 0),
    xPostsUnread: Number(row.x_posts_unread ?? 0),
    youtubeUnwatched: Number(row.youtube_unwatched ?? 0)
  }
}

export async function getLinkById(id: string): Promise<Link | null> {
  const { data, error } = await supabase
    .from('links')
    .select(LINK_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(dbErrorMessage(error))
  return data ? mapLinkRow(data as LinkRow) : null
}

const EXPORT_PAGE_SIZE = 1000
const EXPORT_MAX_PAGES = 100

/**
 * Fetches every link for the user by paging past PostgREST's default row cap.
 * Spans all kinds: export, copy-all, backup and restore conflict detection must
 * see YouTube videos and X posts too, not only library links.
 */
export async function listAllLinks(): Promise<Link[]> {
  const all: Link[] = []

  for (let page = 0; page < EXPORT_MAX_PAGES; page += 1) {
    const offset = page * EXPORT_PAGE_SIZE
    const batch = await listLinks({ limit: EXPORT_PAGE_SIZE, offset, kind: 'all' })
    all.push(...batch)
    if (batch.length < EXPORT_PAGE_SIZE) return all
  }

  // Silently dropping rows from a backup is worse than a loud warning.
  console.warn(
    `[links] full scan hit the ${EXPORT_MAX_PAGES * EXPORT_PAGE_SIZE}-row cap; export/backup is incomplete.`
  )
  return all
}

/** Every stored dedupe key for the user, paged past PostgREST's row cap. */
export async function listAllNormalizedUrls(): Promise<Set<string>> {
  const urls = new Set<string>()

  for (let page = 0; page < EXPORT_MAX_PAGES; page += 1) {
    const offset = page * EXPORT_PAGE_SIZE
    const { data, error } = await supabase
      .from('links')
      .select('url_normalized')
      // Unique order key: without it, concurrent writes can duplicate/skip rows.
      .order('id', { ascending: true })
      .range(offset, offset + EXPORT_PAGE_SIZE - 1)
    if (error) throw new Error(dbErrorMessage(error))

    const rows = data as Array<{ url_normalized: string | null }>
    for (const row of rows) {
      if (row.url_normalized) urls.add(row.url_normalized)
    }
    if (rows.length < EXPORT_PAGE_SIZE) return urls
  }

  console.warn('[links] normalized-URL scan hit the page cap; import dedupe may miss URLs.')
  return urls
}

export async function linkExists(rawUrl: string): Promise<boolean> {
  const normalized = normalizeUrl(rawUrl)
  const { data, error } = await supabase
    .from('links')
    .select('id')
    .eq('url_normalized', normalized)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(dbErrorMessage(error))
  return data !== null
}

/** Resolves a link by its stored dedupe key; used to wire X related links. */
export async function getLinkByNormalizedUrl(rawUrl: string): Promise<Link | null> {
  const normalized = normalizeUrl(rawUrl)
  const { data, error } = await supabase
    .from('links')
    .select(LINK_COLUMNS)
    .eq('url_normalized', normalized)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(dbErrorMessage(error))
  return data ? mapLinkRow(data as LinkRow) : null
}

/** Re-reads rows by id (chunked) for lossless undo snapshots. */
export async function listLinksByIds(ids: readonly string[]): Promise<Link[]> {
  const unique = Array.from(new Set(ids))
  const links: Link[] = []
  for (let index = 0; index < unique.length; index += DEFAULT_INSERT_CHUNK) {
    const chunk = unique.slice(index, index + DEFAULT_INSERT_CHUNK)
    const { data, error } = await supabase
      .from('links')
      .select(LINK_COLUMNS)
      .in('id', chunk)
    if (error) throw new Error(dbErrorMessage(error))
    for (const row of (data ?? []) as LinkRow[]) links.push(mapLinkRow(row))
  }
  return links
}

/** Kind lookup for a set of ids; lets handlers clean up per-kind artifacts on delete. */
export async function listLinkKinds(
  ids: readonly string[]
): Promise<Array<{ id: string; kind: LinkKind }>> {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('links')
    .select('id,kind')
    .in('id', ids as string[])
  if (error) throw new Error(dbErrorMessage(error))

  return (data as Array<{ id: string; kind: string | null }>).map((row) => {
    const parsed = LinkKindSchema.safeParse(row.kind)
    return { id: row.id, kind: parsed.success ? parsed.data : 'link' }
  })
}

export interface NewLinkRecord extends CreateLinkInput {
  label: string
  isRead: boolean
  isArchived: boolean
  /** Preserved on restore when the primary key is free. */
  id?: string
  /** Preserved import/restore timestamp; the DB default applies when omitted. */
  createdAt?: string
  /** Preserved on restore; the DB default applies when omitted. */
  updatedAt?: string
}

export interface BulkInsertResult {
  processed: number
  added: number
  skipped: number
  failed: number
  cancelled: boolean
}

export type InsertBatch = (records: readonly NewLinkRecord[]) => Promise<void>

export interface BulkInsertOptions {
  chunkSize?: number
  signal?: AbortSignal
  insertBatch?: InsertBatch
  onProgress?: (result: Omit<BulkInsertResult, 'cancelled'>) => void
}

const DEFAULT_INSERT_CHUNK = 200

async function insertRecords(records: readonly NewLinkRecord[]): Promise<void> {
  const { error } = await supabase.from('links').insert(
    records.map((record) => {
      // Import/restore rows canonicalize exactly like clipboard captures so
      // mirrors (youtu.be vs watch, /i/status vs /handle/status) share one key.
      const url = canonicalizeLinkUrl(record.url)
      const video = parseYouTubeVideoUrl(url)
      return {
        ...(record.id ? { id: record.id } : {}),
        url,
        title: record.title ?? null,
        description: record.description ?? null,
        thumbnail_url: record.thumbnailUrl ?? null,
        author: record.author ?? null,
        site_name: record.siteName ?? null,
        label: normalizeLabel(record.label),
        note: record.note ?? null,
        kind: classifyLinkKind(url),
        is_read: record.isRead,
        is_archived: record.isArchived,
        duration_seconds: record.durationSeconds ?? null,
        channel_url: record.channelUrl ?? null,
        origin: video?.origin ?? null,
        playlist_id: video?.playlistId ?? null,
        ...(record.createdAt ? { created_at: record.createdAt } : {}),
        ...(record.updatedAt ? { updated_at: record.updatedAt } : {})
      }
    })
  )
  if (error) throw new DatabaseError(dbErrorMessage(error), error.code ?? undefined)
}

/**
 * Chunked, cancellable insert used by imports and restores. A failing chunk is
 * retried row-by-row so a single duplicate (`23505`) is counted as skipped and
 * the run continues instead of aborting (idempotent re-runs).
 */
export async function bulkInsertLinks(
  records: readonly NewLinkRecord[],
  options: BulkInsertOptions = {}
): Promise<BulkInsertResult> {
  const chunkSize = options.chunkSize ?? DEFAULT_INSERT_CHUNK
  const insertBatch = options.insertBatch ?? insertRecords
  const result: BulkInsertResult = {
    processed: 0,
    added: 0,
    skipped: 0,
    failed: 0,
    cancelled: false
  }

  for (let start = 0; start < records.length; start += chunkSize) {
    if (options.signal?.aborted) {
      result.cancelled = true
      break
    }

    const chunk = records.slice(start, start + chunkSize)
    let chunkFailed = false
    try {
      await insertBatch(chunk)
      result.added += chunk.length
      result.processed += chunk.length
    } catch {
      chunkFailed = true
    }

    if (chunkFailed) {
      for (const record of chunk) {
        if (options.signal?.aborted) {
          result.cancelled = true
          break
        }
        try {
          await insertBatch([record])
          result.added += 1
        } catch (error) {
          if (isUniqueViolation(error) && record.id) {
            // The backup id may be taken by an unrelated row (e.g. the user
            // edited the URL after a prior restore). Mint a fresh id and keep
            // the link; a URL-collision retry fails again and is counted skipped.
            try {
              const { id: _omitted, ...withoutId } = record
              await insertBatch([withoutId])
              result.added += 1
            } catch (retryError) {
              if (isUniqueViolation(retryError)) result.skipped += 1
              else result.failed += 1
            }
          } else if (isUniqueViolation(error)) {
            result.skipped += 1
          } else {
            result.failed += 1
          }
        }
        result.processed += 1
      }
    }

    options.onProgress?.({
      processed: result.processed,
      added: result.added,
      skipped: result.skipped,
      failed: result.failed
    })

    if (result.cancelled) break
  }

  return result
}

/**
 * Restores deleted links with their original id/timestamps/state. Goes through
 * the same chunked insert path as import, so a URL that was re-created while the
 * undo window was open is reported as `skipped` (unique violation) rather than
 * failing the whole restore.
 */
export async function restoreLinks(records: readonly RestoreLinkInput[]): Promise<RestoreResult> {
  const result = await bulkInsertLinks(
    records.map((record) => ({
      id: record.id,
      url: record.url,
      title: record.title ?? null,
      description: record.description ?? null,
      thumbnailUrl: record.thumbnailUrl ?? null,
      author: record.author ?? null,
      siteName: record.siteName ?? null,
      label: normalizeLabel(record.label),
      note: record.note ?? null,
      isRead: record.isRead,
      isArchived: record.isArchived,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt ?? undefined,
      durationSeconds: record.durationSeconds ?? null,
      channelUrl: record.channelUrl ?? null
    }))
  )

  return {
    requested: records.length,
    restored: result.added,
    skipped: result.skipped,
    failed: result.failed
  }
}

export async function createLink(input: CreateLinkInput): Promise<Link> {
  const url = canonicalizeLinkUrl(input.url)
  const video = parseYouTubeVideoUrl(url)
  const { data, error } = await supabase
    .from('links')
    .insert({
      id: randomUUID(),
      url,
      title: input.title ?? null,
      description: input.description ?? null,
      thumbnail_url: input.thumbnailUrl ?? null,
      author: input.author ?? null,
      site_name: input.siteName ?? null,
      label: normalizeLabel(input.label),
      note: input.note ?? null,
      kind: classifyLinkKind(url),
      duration_seconds: input.durationSeconds ?? null,
      channel_url: input.channelUrl ?? null,
      origin: video?.origin ?? null,
      playlist_id: video?.playlistId ?? null
    })
    .select(LINK_COLUMNS)
    .single()

  if (error) throw new DatabaseError(dbErrorMessage(error), error.code ?? undefined)
  return mapLinkRow(data as LinkRow)
}

export interface LinkContentInput {
  contentHtml: string | null
  contentText: string | null
  wordCount: number | null
  status: ExtractionStatus
}

export interface LinkContentRow {
  content_html: string | null
  content_text: string | null
  word_count: number | null
  extraction_status: string | null
  extracted_at: string | null
}

const LINK_CONTENT_COLUMNS = 'content_html,content_text,word_count,extraction_status,extracted_at'

/** Writes (or refreshes) the readable copy for a link. One row per link. */
export async function upsertLinkContent(
  linkId: string,
  content: LinkContentInput,
  extractedAt: string
): Promise<void> {
  const { error } = await supabase.from('link_content').upsert(
    {
      link_id: linkId,
      content_html: content.contentHtml,
      content_text: content.contentText,
      word_count: content.wordCount,
      extraction_status: content.status,
      extracted_at: extractedAt
    },
    { onConflict: 'link_id' }
  )
  if (error) throw new Error(dbErrorMessage(error))
}

export async function getLinkContent(linkId: string): Promise<LinkContentRow | null> {
  const { data, error } = await supabase
    .from('link_content')
    .select(LINK_CONTENT_COLUMNS)
    .eq('link_id', linkId)
    .maybeSingle()
  if (error) throw new Error(dbErrorMessage(error))
  return (data as LinkContentRow | null) ?? null
}

export interface LinkContentBackupRow extends LinkContentRow {
  link_id: string
}

/** Every reader-content row for the user, paged for backups. */
export async function listAllLinkContents(): Promise<LinkContentBackupRow[]> {
  const all: LinkContentBackupRow[] = []

  for (let page = 0; page < EXPORT_MAX_PAGES; page += 1) {
    const offset = page * EXPORT_PAGE_SIZE
    const { data, error } = await supabase
      .from('link_content')
      .select(`link_id,${LINK_CONTENT_COLUMNS}`)
      .order('link_id', { ascending: true })
      .range(offset, offset + EXPORT_PAGE_SIZE - 1)
    if (error) throw new Error(dbErrorMessage(error))

    const rows = data as LinkContentBackupRow[]
    all.push(...rows)
    if (rows.length < EXPORT_PAGE_SIZE) return all
  }

  console.warn('[reader] content scan hit the page cap; backup/restore is incomplete.')
  return all
}

export async function updateLink(id: string, patch: UpdateLinkPatch): Promise<Link> {
  const payload = buildLinkUpdatePayload(patch)
  if (Object.keys(payload).length === 0) {
    throw new Error('No fields to update.')
  }

  const { data, error } = await supabase
    .from('links')
    .update(payload)
    .eq('id', id)
    .select(LINK_COLUMNS)
    .single()

  if (error) throw new Error(dbErrorMessage(error))
  return mapLinkRow(data as LinkRow)
}

export interface LinkMetadataEnrichment {
  title?: string | null
  description?: string | null
  author?: string | null
  siteName?: string | null
}

/**
 * Fills blank metadata fields (e.g. from an X oEmbed payload) without ever
 * overwriting a value the user or a previous fetch already wrote.
 */
export async function enrichLinkMetadata(
  id: string,
  fields: LinkMetadataEnrichment
): Promise<void> {
  const link = await getLinkById(id)
  if (!link) return

  const patch: UpdateLinkPatch = {}
  if (!link.title && fields.title) patch.title = fields.title
  if (!link.description && fields.description) patch.description = fields.description
  if (!link.author && fields.author) patch.author = fields.author
  if (!link.siteName && fields.siteName) patch.siteName = fields.siteName
  if (Object.keys(patch).length === 0) return

  await updateLink(id, patch)
}

export async function deleteLink(id: string): Promise<void> {
  const { error } = await supabase.from('links').delete().eq('id', id)
  if (error) throw new Error(dbErrorMessage(error))
}

export async function bulkUpdateLinks(ids: string[], patch: UpdateLinkPatch): Promise<void> {
  if (ids.length === 0) return
  const payload = buildLinkUpdatePayload(patch)
  if (Object.keys(payload).length === 0) throw new Error('No fields to update.')

  // Chunked: thousands of UUIDs in one `id=in.(...)` URL exceed gateway limits.
  for (let start = 0; start < ids.length; start += DEFAULT_INSERT_CHUNK) {
    const chunk = ids.slice(start, start + DEFAULT_INSERT_CHUNK)
    const { error } = await supabase.from('links').update(payload).in('id', chunk)
    if (error) throw new Error(dbErrorMessage(error))
  }
}

/**
 * Marks every unread link matching the current filters as read server-side
 * (never loads rows to the client). Returns how many rows changed.
 *
 * Runs as an RPC rather than a PostgREST `or()` filter: search terms can carry
 * commas/parentheses, which cannot be escaped reliably in the filter grammar.
 */
export async function markAllRead(query: LinkQuery = {}): Promise<MarkAllReadResult> {
  const { data, error } = await supabase.rpc('linkster_mark_all_read', {
    p_term: query.search?.trim() || null,
    p_filter: query.filter ?? 'all',
    p_label: query.label ?? null,
    p_domain: query.domain?.trim() || null,
    p_date_from: query.dateFrom ?? null,
    p_date_to: query.dateTo ?? null,
    p_kind: query.kind ?? 'link',
    // Same content predicate as the visible search results, otherwise the
    // grid can show matches that "mark all read" refuses to update.
    p_include_content: query.searchContent ?? true
  })
  if (error) throw new Error(dbErrorMessage(error))
  return { updated: typeof data === 'number' ? data : Number((data as number) ?? 0) }
}

export async function bulkDeleteLinks(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  for (let start = 0; start < ids.length; start += DEFAULT_INSERT_CHUNK) {
    const chunk = ids.slice(start, start + DEFAULT_INSERT_CHUNK)
    const { error } = await supabase.from('links').delete().in('id', chunk)
    if (error) throw new Error(dbErrorMessage(error))
  }
}

export async function ensureLabel(rawName: string): Promise<string> {
  const name = normalizeLabel(rawName)

  const { data, error } = await supabase
    .from('labels')
    .select('id')
    .eq('name', name)
    .maybeSingle()
  if (error) throw new Error(dbErrorMessage(error))

  if (!data) {
    const { error: insertError } = await supabase.from('labels').insert({ name })
    if (insertError && insertError.code !== '23505') {
      throw new Error(dbErrorMessage(insertError))
    }
  }

  return name
}
