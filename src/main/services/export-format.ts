import type { Link } from '@shared/contract/ipc'

const CSV_HEADERS = [
  'id',
  'url',
  'title',
  'description',
  'thumbnail_url',
  'label',
  'kind',
  'is_read',
  'is_archived',
  'created_at',
  'updated_at',
  'user_id'
] as const

type Row = Record<(typeof CSV_HEADERS)[number], string | boolean | null>

function toRow(link: Link): Row {
  return {
    id: link.id,
    url: link.url,
    title: link.title,
    description: link.description,
    thumbnail_url: link.thumbnailUrl,
    label: link.label,
    kind: link.kind,
    is_read: link.isRead,
    is_archived: link.isArchived,
    created_at: link.createdAt,
    updated_at: link.updatedAt,
    user_id: link.userId
  }
}

function csvCell(value: string | boolean | null): string {
  if (value === null) return ''
  let text = String(value)
  // Spreadsheet formula injection: a cell starting with =,+,-,@ (or tab/CR)
  // executes when the export is opened in Excel/Sheets; prefix with a quote.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function linksToJson(links: readonly Link[]): string {
  return JSON.stringify(links.map(toRow), null, 2)
}

export function linksToCsv(links: readonly Link[]): string {
  const lines = [CSV_HEADERS.join(',')]
  for (const link of links) {
    const row = toRow(link)
    lines.push(CSV_HEADERS.map((header) => csvCell(row[header])).join(','))
  }
  return lines.join('\r\n')
}

export function linksToText(links: readonly Link[]): string {
  return links.map((link) => `${link.title ?? link.url}\t${link.url}`).join('\n')
}
