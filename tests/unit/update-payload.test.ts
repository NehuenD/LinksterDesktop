import { describe, expect, it } from 'vitest'
import { buildLinkUpdatePayload } from '../../src/main/data/link-mapper'

describe('buildLinkUpdatePayload', () => {
  it('omits fields that were not provided', () => {
    expect(buildLinkUpdatePayload({})).toEqual({})
    expect(buildLinkUpdatePayload({ isRead: true })).toEqual({ is_read: true })
  })

  it('maps camelCase fields to snake_case columns', () => {
    const payload = buildLinkUpdatePayload({
      title: 'T',
      description: 'D',
      thumbnailUrl: 'https://img',
      label: 'Work',
      isArchived: true
    })
    expect(payload).toEqual({
      title: 'T',
      description: 'D',
      thumbnail_url: 'https://img',
      label: 'Work',
      is_archived: true
    })
  })

  it('never emits immutable columns', () => {
    const payload = buildLinkUpdatePayload({ url: 'https://example.com', isRead: false })
    expect(Object.keys(payload).sort()).toEqual(['is_read', 'kind', 'url'])
    expect(payload).not.toHaveProperty('id')
    expect(payload).not.toHaveProperty('user_id')
    expect(payload).not.toHaveProperty('created_at')
  })

  it('reclassifies kind and canonicalizes the URL on a URL edit', () => {
    expect(buildLinkUpdatePayload({ url: 'https://youtu.be/dQw4w9WgXcQ?si=abc' })).toEqual({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      kind: 'youtube'
    })
    expect(buildLinkUpdatePayload({ url: 'https://twitter.com/jack/status/20' })).toEqual({
      url: 'https://x.com/i/status/20',
      kind: 'x-post'
    })
    expect(buildLinkUpdatePayload({ url: 'https://example.com/a' })).toEqual({
      url: 'https://example.com/a',
      kind: 'link'
    })
  })

  it('coalesces a blank label to General', () => {
    expect(buildLinkUpdatePayload({ label: '  ' })).toEqual({ label: 'General' })
  })

  it('maps the note field, including an explicit clear', () => {
    expect(buildLinkUpdatePayload({ note: 'Read later' })).toEqual({ note: 'Read later' })
    expect(buildLinkUpdatePayload({ note: null })).toEqual({ note: null })
  })
})
