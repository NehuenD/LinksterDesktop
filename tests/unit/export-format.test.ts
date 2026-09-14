import { describe, expect, it } from 'vitest'
import type { Link } from '@shared/contract/ipc'
import { linksToCsv, linksToJson, linksToText } from '../../src/main/services/export-format'

const link: Link = {
  id: 'id-1',
  url: 'https://example.com',
  title: 'Title',
  description: 'Has, comma',
  thumbnailUrl: null,
  label: 'General',
  isRead: false,
  isArchived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: null,
  userId: 'u1'
}

describe('linksToCsv', () => {
  it('writes a header row and escapes cells containing commas', () => {
    const lines = linksToCsv([link]).split('\r\n')
    expect(lines[0]).toContain('id,url,title,description')
    expect(lines[1]).toContain('"Has, comma"')
  })

  it('escapes embedded quotes', () => {
    const csv = linksToCsv([{ ...link, title: 'He said "hi"' }])
    expect(csv).toContain('"He said ""hi"""')
  })
})

describe('linksToJson', () => {
  it('emits snake_case keys with a stable shape', () => {
    const parsed = JSON.parse(linksToJson([link])) as Array<Record<string, unknown>>
    expect(parsed[0]).toMatchObject({
      id: 'id-1',
      thumbnail_url: null,
      is_read: false,
      user_id: 'u1'
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
