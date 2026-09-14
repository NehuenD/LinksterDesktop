import type { Link, LinkQuery, LinkStats } from '@shared/contract/ipc'
import { supabase } from '../auth/supabase'
import { computeStats, mapLinkRow, normalizeLabel, type LinkRow } from './link-mapper'

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

  if (query.filter === 'unread') request = request.eq('is_read', false)
  if (query.filter === 'archived') request = request.eq('is_archived', true)
  if (query.label) request = request.eq('label', query.label)

  const search = query.search?.trim() ?? ''
  if (search.length > 0) {
    const term = escapeSearchTerm(search)
    request = request.or(
      `title.ilike.%${term}%,description.ilike.%${term}%,url.ilike.%${term}%`
    )
  }

  const { data, error } = await request
  if (error) throw new Error(error.message)
  return (data as LinkRow[]).map(mapLinkRow)
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
