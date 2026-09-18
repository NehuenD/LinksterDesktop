import { describe, expect, it } from 'vitest'
import { DEFAULT_LABEL } from '@shared/contract/ipc'
import {
  mapLinkRow,
  mapLinkRows,
  normalizeLabel,
  type LinkRow
} from '../../src/main/data/link-mapper'

const baseRow: LinkRow = {
  id: 'id-1',
  url: 'https://example.com',
  title: null,
  description: null,
  thumbnail_url: null,
  author: null,
  site_name: null,
  label: null,
  note: null,
  is_read: null,
  is_archived: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: null,
  user_id: null
}

describe('mapLinkRow', () => {
  it('maps snake_case columns and coalesces a missing label to General', () => {
    const link = mapLinkRow(baseRow)
    expect(link).toMatchObject({
      id: 'id-1',
      url: 'https://example.com',
      label: DEFAULT_LABEL,
      isRead: false,
      isArchived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: null,
      userId: null
    })
  })

  it('maps thumbnail, label and boolean flags', () => {
    const link = mapLinkRow({
      ...baseRow,
      thumbnail_url: 'https://img.example.com/a.png',
      label: 'News',
      is_read: true,
      is_archived: true
    })
    expect(link.thumbnailUrl).toBe('https://img.example.com/a.png')
    expect(link.label).toBe('News')
    expect(link.isRead).toBe(true)
    expect(link.isArchived).toBe(true)
  })

  it('maps the note field and defaults it to null', () => {
    expect(mapLinkRow({ ...baseRow, note: 'Read this weekend' }).note).toBe('Read this weekend')
    expect(mapLinkRow(baseRow).note).toBeNull()
  })

  it('maps the link kind and tolerates missing or unknown values', () => {
    expect(mapLinkRow({ ...baseRow, kind: 'x-post' }).kind).toBe('x-post')
    expect(mapLinkRow({ ...baseRow, kind: 'youtube' }).kind).toBe('youtube')
    expect(mapLinkRow(baseRow).kind).toBe('link')
    expect(mapLinkRow({ ...baseRow, kind: 'nonsense' }).kind).toBe('link')
  })

  it('throws when id or url is missing', () => {
    expect(() => mapLinkRow({ ...baseRow, id: undefined as unknown as string })).toThrow()
    expect(() => mapLinkRow({ ...baseRow, url: undefined as unknown as string })).toThrow()
  })

  it('falls back to epoch for an invalid created_at', () => {
    expect(mapLinkRow({ ...baseRow, created_at: 'nonsense' }).createdAt).toBe(
      new Date(0).toISOString()
    )
  })

  it('maps reader badge fields from the embedded content row', () => {
    const link = mapLinkRow({
      ...baseRow,
      link_content: { word_count: 450, extraction_status: 'ok' }
    })
    expect(link.wordCount).toBe(450)
    expect(link.readingTimeMinutes).toBe(2)
    expect(link.extractionStatus).toBe('ok')
  })

  it('maps reader badge fields from flat rpc columns', () => {
    const link = mapLinkRow({ ...baseRow, word_count: 225, extraction_status: 'media' })
    expect(link.wordCount).toBe(225)
    expect(link.extractionStatus).toBe('media')
  })

  it('defaults reader fields when no content row exists', () => {
    const link = mapLinkRow(baseRow)
    expect(link.wordCount).toBeNull()
    expect(link.readingTimeMinutes).toBeNull()
    expect(link.extractionStatus).toBe('none')
  })
})

describe('normalizeLabel', () => {
  it('trims whitespace and defaults blank labels', () => {
    expect(normalizeLabel('  Work  ')).toBe('Work')
    expect(normalizeLabel('   ')).toBe(DEFAULT_LABEL)
    expect(normalizeLabel(null)).toBe(DEFAULT_LABEL)
  })
})

describe('mapLinkRows', () => {
  it('skips malformed rows instead of failing the page', () => {
    const rows: LinkRow[] = [
      baseRow,
      { ...baseRow, id: undefined as unknown as string },
      { ...baseRow, id: 'id-2', url: 'https://second.example' }
    ]
    const links = mapLinkRows(rows)
    expect(links.map((link) => link.id)).toEqual(['id-1', 'id-2'])
  })
})

