import type { Link, RestoreLinkInput } from '@shared/contract/ipc'

/**
 * Full-row undo snapshot: keeps the original id, timestamps and read/archive
 * state so `links:restore` re-inserts the same row instead of re-creating it.
 */
export function toRestoreLinkInput(link: Link): RestoreLinkInput {
  return {
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
    updatedAt: link.updatedAt,
    durationSeconds: link.durationSeconds ?? null,
    channelUrl: link.channelUrl ?? null
  }
}
