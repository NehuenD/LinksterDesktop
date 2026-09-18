import { describe, expect, it } from 'vitest'
import type { Link } from '@shared/contract/ipc'
import { mergeLink, mergeLinks } from '@shared/lib/link-merge'

function link(overrides: Partial<Link> = {}): Link {
  return {
    id: '1',
    url: 'https://example.com',
    title: 'Title',
    description: 'desc',
    thumbnailUrl: null,
    author: null,
    siteName: null,
    label: 'General',
    kind: 'link',
    isRead: false,
    isArchived: false,
    note: null,
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: '2026-09-15T10:00:00.000Z',
    userId: 'u1',
    wordCount: null,
    readingTimeMinutes: null,
    extractionStatus: 'none',
    ...overrides
  }
}

const T1 = Date.parse('2026-09-15T10:00:00.000Z')
const T2 = Date.parse('2026-09-15T10:00:05.000Z')
const T3 = Date.parse('2026-09-15T10:00:10.000Z')

describe('mergeLink', () => {
  it('takes the remote row when the link has no local edits', () => {
    const result = mergeLink(link({ isRead: true }), link({ isRead: false }))

    expect(result.link.isRead).toBe(false)
    expect(result.conflict).toBe(false)
    expect(result.reapplied).toBe(false)
  })

  it('preserves a local edit newer than the remote row', () => {
    const local = link({ isRead: true, updatedAt: new Date(T2).toISOString() })
    const remote = link({ isRead: false, updatedAt: new Date(T1).toISOString() })

    const result = mergeLink(local, remote, { fields: ['isRead'], at: T2 })

    expect(result.link.isRead).toBe(true)
    expect(result.conflict).toBe(false)
    expect(result.reapplied).toBe(true)
  })

  it('keeps the local edit but flags a conflict when the remote changed later', () => {
    const local = link({ isRead: true })
    const remote = link({ isRead: false, updatedAt: new Date(T3).toISOString() })

    const result = mergeLink(local, remote, { fields: ['isRead'], at: T2 })

    expect(result.link.isRead).toBe(true)
    expect(result.conflict).toBe(true)
  })

  it('does not flag a conflict when the newer remote agrees with the local edit', () => {
    const local = link({ isRead: true })
    const remote = link({ isRead: true, updatedAt: new Date(T3).toISOString() })

    const result = mergeLink(local, remote, { fields: ['isRead'], at: T2 })

    expect(result.conflict).toBe(false)
    expect(result.link.isRead).toBe(true)
  })

  it('still applies remote changes to non-dirty fields', () => {
    const local = link({ isRead: true, description: 'old' })
    const remote = link({ isRead: false, description: 'new', updatedAt: new Date(T1).toISOString() })

    const result = mergeLink(local, remote, { fields: ['isRead'], at: T2 })

    expect(result.link.isRead).toBe(true)
    expect(result.link.description).toBe('new')
  })
})

describe('mergeLinks', () => {
  it('merges by id and reports conflicted ids', () => {
    const dirty = new Map([['1', { fields: ['isRead'] as Array<keyof Link>, at: T2 }]])
    const local = [link({ id: '1', isRead: true }), link({ id: '2', title: 'Local 2' })]
    const remote = [
      link({ id: '1', isRead: false, updatedAt: new Date(T3).toISOString() }),
      link({ id: '2', title: 'Remote 2' })
    ]

    const result = mergeLinks(local, remote, dirty)

    expect(result.links[0].isRead).toBe(true)
    expect(result.links[1].title).toBe('Remote 2')
    expect(result.conflicts).toEqual(['1'])
  })
})
