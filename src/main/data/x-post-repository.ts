import type { XCaptureStatus, XPostQuery } from '@shared/contract/ipc'
import { supabase } from '../auth/supabase'
import { DatabaseError, dbErrorMessage } from './db-error'

export interface XPostMetadataInput {
  linkId: string
  tweetId: string
  authorHandle: string | null
  authorName: string | null
  text: string | null
  postedAt: string | null
  relatedUrl: string | null
}

/** Creates or refreshes the tweet metadata row for a captured X post. */
export async function upsertXPostMetadata(input: XPostMetadataInput): Promise<void> {
  const { error } = await supabase.from('link_x_posts').upsert(
    {
      link_id: input.linkId,
      tweet_id: input.tweetId,
      author_handle: input.authorHandle,
      author_name: input.authorName,
      text: input.text,
      posted_at: input.postedAt,
      related_url: input.relatedUrl,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'link_id' }
  )
  if (error) throw new DatabaseError(dbErrorMessage(error), error.code ?? undefined)
}

/**
 * Inserts the metadata row if it is missing without touching existing metadata.
 * Used when oEmbed was unavailable but the screenshot still succeeded.
 */
export async function ensureXPostRow(linkId: string, tweetId: string): Promise<void> {
  const { error } = await supabase
    .from('link_x_posts')
    .upsert({ link_id: linkId, tweet_id: tweetId }, { onConflict: 'link_id', ignoreDuplicates: true })
  if (error) throw new Error(dbErrorMessage(error))
}

export interface XPostCaptureStateInput {
  status: XCaptureStatus
  error?: string | null
  capturedAt?: string | null
}

/** Updates the capture state on an existing metadata row (no-op when absent). */
export async function updateXPostCaptureState(
  linkId: string,
  state: XPostCaptureStateInput
): Promise<void> {
  const patch: Record<string, unknown> = {
    capture_status: state.status,
    updated_at: new Date().toISOString()
  }
  if (state.error !== undefined) patch.capture_error = state.error
  if (state.capturedAt !== undefined) patch.captured_at = state.capturedAt

  const { error } = await supabase.from('link_x_posts').update(patch).eq('link_id', linkId)
  if (error) throw new Error(dbErrorMessage(error))
}

export interface XPostListRow {
  link_id: string
  url: string
  is_read: boolean | null
  is_archived: boolean | null
  created_at: string | null
  tweet_id: string | null
  author_handle: string | null
  author_name: string | null
  text: string | null
  posted_at: string | null
  capture_status: string | null
  capture_error: string | null
  captured_at: string | null
  related_url: string | null
  related_link_id: string | null
  related_title: string | null
  related_link_url: string | null
  total: number | string | null
}

/** RLS-scoped X section listing (link + capture metadata + related link). */
export async function listXPosts(
  limit = 100,
  query: XPostQuery = {}
): Promise<XPostListRow[]> {
  const { data, error } = await supabase.rpc('x_post_list', {
    p_limit: limit,
    p_offset: query.offset ?? 0,
    p_search: query.search?.trim() || null,
    p_filter: query.filter ?? 'all',
    p_sort: query.sort ?? 'newest'
  })
  if (error) throw new Error(dbErrorMessage(error))
  return (data ?? []) as XPostListRow[]
}

/** Wires `related_link_id` for X posts whose related URL has since been captured. */
export async function resolveXRelatedLinks(): Promise<number> {
  const { data, error } = await supabase.rpc('linkster_resolve_x_related_links')
  if (error) throw new Error(dbErrorMessage(error))
  return typeof data === 'number' ? data : 0
}

/** Resolves the already-captured link for a tweet, if any (mirror dedupe). */
export async function findXPostLinkIdByTweetId(tweetId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('link_x_posts')
    .select('link_id')
    .eq('tweet_id', tweetId)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(dbErrorMessage(error))
  return (data as { link_id: string } | null)?.link_id ?? null
}

export interface XPostBackupRow {
  link_id: string
  tweet_id: string
  author_handle: string | null
  author_name: string | null
  text: string | null
  posted_at: string | null
  related_url: string | null
}

const XPOST_COLUMNS =
  'link_id,tweet_id,author_handle,author_name,text,posted_at,related_url'

const PAGE_SIZE = 1000
const MAX_PAGES = 100

/** Every X post metadata row for the user, paged for backups. */
export async function listAllXPostMetadata(): Promise<XPostBackupRow[]> {
  const all: XPostBackupRow[] = []

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_SIZE
    const { data, error } = await supabase
      .from('link_x_posts')
      .select(XPOST_COLUMNS)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(dbErrorMessage(error))

    const rows = data as XPostBackupRow[]
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  return all
}

export interface XPostRestoreInput {
  linkId: string
  tweetId: string
  authorHandle: string | null
  authorName: string | null
  text: string | null
  postedAt: string | null
  relatedUrl: string | null
}

/**
 * Restores tweet metadata for a link from a backup. The capture PNG is
 * local-only and is not part of the archive, so the capture state resets to
 * `none`: the post is immediately re-capturable on this device.
 */
export async function restoreXPostMetadata(row: XPostRestoreInput): Promise<void> {
  const { error } = await supabase.from('link_x_posts').upsert(
    {
      link_id: row.linkId,
      tweet_id: row.tweetId,
      author_handle: row.authorHandle,
      author_name: row.authorName,
      text: row.text,
      posted_at: row.postedAt,
      related_url: row.relatedUrl,
      capture_status: 'none',
      capture_error: null,
      captured_at: null,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'link_id' }
  )
  if (error) throw new DatabaseError(dbErrorMessage(error), error.code ?? undefined)
}

export interface XPostLinkRow {
  id: string
  url: string
}

/** Every persisted X post link (id + url), paged for boot reconciliation. */
export async function listXPostLinks(): Promise<XPostLinkRow[]> {
  const all: XPostLinkRow[] = []

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_SIZE
    const { data, error } = await supabase
      .from('links')
      .select('id,url')
      .eq('kind', 'x-post')
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(dbErrorMessage(error))

    const rows = data as XPostLinkRow[]
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  return all
}

/** Every stored capture state, keyed by link id, for boot reconciliation. */
export async function listXPostCaptureStates(): Promise<Map<string, XCaptureStatus>> {
  const states = new Map<string, XCaptureStatus>()

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_SIZE
    const { data, error } = await supabase
      .from('link_x_posts')
      .select('link_id,capture_status')
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(dbErrorMessage(error))

    const rows = data as Array<{ link_id: string; capture_status: string | null }>
    for (const row of rows) {
      const status = row.capture_status
      if (status === 'none' || status === 'pending' || status === 'ok' || status === 'failed') {
        states.set(row.link_id, status)
      }
    }
    if (rows.length < PAGE_SIZE) break
  }

  return states
}
