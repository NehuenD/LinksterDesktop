import { describe, expect, it } from 'vitest'
import { DEFAULT_LABEL } from '@shared/contract/ipc'
import {
  computeStats,
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
  label: null,
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

  it('throws when id or url is missing', () => {
    expect(() => mapLinkRow({ ...baseRow, id: undefined as unknown as string })).toThrow()
    expect(() => mapLinkRow({ ...baseRow, url: undefined as unknown as string })).toThrow()
  })

  it('falls back to epoch for an invalid created_at', () => {
    expect(mapLinkRow({ ...baseRow, created_at: 'nonsense' }).createdAt).toBe(
      new Date(0).toISOString()
    )
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

describe('computeStats', () => {
  it('aggregates totals and per-label counts', () => {
    const stats = computeStats([
      { label: 'General', isRead: false, isArchived: false },
      { label: 'General', isRead: true, isArchived: true },
      { label: 'News', isRead: false, isArchived: false }
    ])
    expect(stats).toEqual({
      total: 3,
      unread: 2,
      archived: 1,
      byLabel: { General: 2, News: 1 }
    })
  })

  it('excludes archived items from the unread count', () => {
    const stats = computeStats([{ label: 'General', isRead: false, isArchived: true }])
    expect(stats.unread).toBe(0)
    expect(stats.archived).toBe(1)
  })
})
