import { DEFAULT_LABEL, type Link, type LinkStats } from '@shared/contract/ipc'

export interface LinkRow {
  id: string
  url: string
  title: string | null
  description: string | null
  thumbnail_url: string | null
  label: string | null
  is_read: boolean | null
  is_archived: boolean | null
  created_at: string | null
  updated_at: string | null
  user_id: string | null
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

export function mapLinkRow(row: LinkRow): Link {
  if (typeof row.id !== 'string' || typeof row.url !== 'string') {
    throw new Error('Invalid link row: id and url are required')
  }
  return {
    id: row.id,
    url: row.url,
    title: row.title ?? null,
    description: row.description ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    label: normalizeLabel(row.label),
    isRead: row.is_read === true,
    isArchived: row.is_archived === true,
    createdAt: parseDate(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: parseDate(row.updated_at),
    userId: row.user_id ?? null
  }
}

export interface LinkPatchLike {
  url?: string
  title?: string | null
  description?: string | null
  thumbnailUrl?: string | null
  label?: string | null
  isRead?: boolean
  isArchived?: boolean
}

export function buildLinkUpdatePayload(patch: LinkPatchLike): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (patch.url !== undefined) payload.url = patch.url
  if (patch.title !== undefined) payload.title = patch.title
  if (patch.description !== undefined) payload.description = patch.description
  if (patch.thumbnailUrl !== undefined) payload.thumbnail_url = patch.thumbnailUrl
  if (patch.label !== undefined) payload.label = normalizeLabel(patch.label)
  if (patch.isRead !== undefined) payload.is_read = patch.isRead
  if (patch.isArchived !== undefined) payload.is_archived = patch.isArchived
  return payload
}

export function computeStats(
  links: readonly Pick<Link, 'label' | 'isRead' | 'isArchived'>[]
): LinkStats {
  const byLabel: Record<string, number> = {}
  let unread = 0
  let archived = 0

  for (const link of links) {
    byLabel[link.label] = (byLabel[link.label] ?? 0) + 1
    if (!link.isRead) unread += 1
    if (link.isArchived) archived += 1
  }

  return { total: links.length, unread, archived, byLabel }
}
