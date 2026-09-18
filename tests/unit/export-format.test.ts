import { describe, expect, it } from 'vitest'
import type { Link } from '@shared/contract/ipc'
import { linksToCsv, linksToJson, linksToText } from '../../src/main/services/export-format'

const link: Link = {
  id: 'id-1',
  url: 'https://example.com',
  title: 'Title',
  description: 'Has, comma',
  thumbnailUrl: null,
  author: null,
  siteName: null,
  label: 'General',
  kind: 'link',
  isRead: false,
  isArchived: false,
  note: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: null,
  userId: 'u1',
  wordCount: null,
  readingTimeMinutes: null,
  extractionStatus: 'none'
}

describe('linksToCsv', () => {
  it('writes a header row and escapes cells containing commas', () => {
    const lines = linksToCsv([link]).split('\r\n')
    expect(lines[0]).toContain('id,url,title,description')
    expect(lines[0]).toContain('kind')
    expect(lines[1]).toContain('"Has, comma"')
  })

  it('escapes embedded quotes', () => {
    const csv = linksToCsv([{ ...link, title: 'He said "hi"' }])
    expect(csv).toContain('"He said ""hi"""')
  })

  it('neutralizes spreadsheet formula injection', () => {
    const csv = linksToCsv([
      {
        ...link,
        title: '=HYPERLINK("http://evil.example")',
        description: '+cmd|calc'
      }
    ])
    expect(csv).toContain("'=HYPERLINK")
    expect(csv).toContain("'+cmd|calc")
  })
})

describe('linksToJson', () => {
  it('emits snake_case keys with a stable shape', () => {
    const parsed = JSON.parse(linksToJson([link])) as Array<Record<string, unknown>>
    expect(parsed[0]).toMatchObject({
      id: 'id-1',
      thumbnail_url: null,
      is_read: false,
      user_id: 'u1',
      kind: 'link'
    })
  })
})

describe('linksToText', () => {
  it('formats title and url per line', () => {
    expect(linksToText([link])).toBe('Title\thttps://example.com')
  })

  it('falls back to the url when the title is missing', () => {
    expect(linksToText([{ ...link, title: null }])).toBe(
      'https://example.com\thttps://example.com'
    )
  })
})
