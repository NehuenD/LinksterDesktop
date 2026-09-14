import { randomUUID } from 'node:crypto'
import type { CreateLinkInput, Link, LinkQuery, LinkStats, UpdateLinkPatch } from '@shared/contract/ipc'
import { supabase } from '../auth/supabase'
import {
  buildLinkUpdatePayload,
  computeStats,
  mapLinkRow,
  mapLinkRows,
  normalizeLabel,
  type LinkRow
} from './link-mapper'
import { normalizeUrl } from './url-normalizer'

const LINK_COLUMNS =
  'id,url,title,description,thumbnail_url,label,is_read,is_archived,created_at,updated_at,user_id'

function escapeSearchTerm(value: string): string {
  return value.replace(/[\\%_(),]/g, (match) => `\\${match}`)
}

export async function listLinks(query: LinkQuery = {}): Promise<Link[]> {
  let request = supabase
    .from('links')
    .select(LINK_COLUMNS)
    .order('created_at', { ascending: false })

  if (query.filter === 'unread') {
    request = request.eq('is_read', false).eq('is_archived', false)
  }
  if (query.filter === 'archived') request = request.eq('is_archived', true)
  if (query.label) request = request.eq('label', query.label)

  const search = query.search?.trim() ?? ''
  if (search.length > 0) {
    const term = escapeSearchTerm(search)
    request = request.or(
      `title.ilike.%${term}%,description.ilike.%${term}%,url.ilike.%${term}%`
    )
  }

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
  if (error) throw new Error(error.message)
  return mapLinkRows(data as LinkRow[])
}

interface StatsRow {
  label: string | null
  is_read: boolean | null
  is_archived: boolean | null
}

export async function getLinkStats(): Promise<LinkStats> {
  const { data, error } = await supabase.from('links').select('label,is_read,is_archived')
  if (error) throw new Error(error.message)

  const rows = (data as StatsRow[]).map((row) => ({
    label: normalizeLabel(row.label),
    isRead: row.is_read === true,
    isArchived: row.is_archived === true
  }))

  return computeStats(rows)
}

export async function getLinkById(id: string): Promise<Link | null> {
  const { data, error } = await supabase
    .from('links')
    .select(LINK_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapLinkRow(data as LinkRow) : null
}

const EXPORT_PAGE_SIZE = 1000
const EXPORT_MAX_PAGES = 100

/**
 * Fetches every link for the user by paging past PostgREST's default row cap.
 */
export async function listAllLinks(): Promise<Link[]> {
  const all: Link[] = []

  for (let page = 0; page < EXPORT_MAX_PAGES; page += 1) {
    const offset = page * EXPORT_PAGE_SIZE
    const batch = await listLinks({ limit: EXPORT_PAGE_SIZE, offset })
    all.push(...batch)
    if (batch.length < EXPORT_PAGE_SIZE) break
  }

  return all
}

export async function linkExists(rawUrl: string): Promise<boolean> {
  const normalized = normalizeUrl(rawUrl)
  const { data, error } = await supabase
    .from('links')
    .select('id')
    .eq('url_normalized', normalized)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data !== null
}

export class DatabaseError extends Error {
  readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'DatabaseError'
    this.code = code
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === '23505'
}

export async function createLink(input: CreateLinkInput): Promise<Link> {
  const { data, error } = await supabase
    .from('links')
    .insert({
      id: randomUUID(),
      url: input.url,
      title: input.title ?? null,
      description: input.description ?? null,
      thumbnail_url: input.thumbnailUrl ?? null,
      label: normalizeLabel(input.label)
    })
    .select(LINK_COLUMNS)
    .single()

  if (error) throw new DatabaseError(error.message, error.code ?? undefined)
  return mapLinkRow(data as LinkRow)
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

  if (error) throw new Error(error.message)
  return mapLinkRow(data as LinkRow)
}

export async function deleteLink(id: string): Promise<void> {
  const { error } = await supabase.from('links').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function bulkUpdateLinks(ids: string[], patch: UpdateLinkPatch): Promise<void> {
  if (ids.length === 0) return
  const payload = buildLinkUpdatePayload(patch)
  if (Object.keys(payload).length === 0) throw new Error('No fields to update.')

  const { error } = await supabase.from('links').update(payload).in('id', ids)
  if (error) throw new Error(error.message)
}

export async function bulkDeleteLinks(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('links').delete().in('id', ids)
  if (error) throw new Error(error.message)
}

export async function ensureLabel(rawName: string): Promise<string> {
  const name = normalizeLabel(rawName)

  const { data, error } = await supabase
    .from('labels')
    .select('id')
    .eq('name', name)
    .maybeSingle()
  if (error) throw new Error(error.message)

  if (!data) {
    const { error: insertError } = await supabase.from('labels').insert({ name })
    if (insertError && insertError.code !== '23505') {
      throw new Error(insertError.message)
    }
  }

  return name
}
