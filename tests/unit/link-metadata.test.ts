import { describe, expect, it } from 'vitest'
import { hasMetadataChanges } from '../../src/shared/lib/link-metadata'

const BEFORE = {
  title: 'Old title',
  description: null,
  thumbnailUrl: null,
  author: 'Channel',
  siteName: 'YouTube',
  durationSeconds: 213,
  channelUrl: 'https://www.youtube.com/@a'
}

describe('hasMetadataChanges', () => {
  it('detects a changed title', () => {
    expect(hasMetadataChanges(BEFORE, { ...BEFORE, title: 'New title' })).toBe(true)
  })

  it('detects a newly discovered duration', () => {
    expect(hasMetadataChanges({ ...BEFORE, durationSeconds: null }, BEFORE)).toBe(true)
  })

  it('reports no change when values match, treating missing as null', () => {
    expect(
      hasMetadataChanges(
        { ...BEFORE, durationSeconds: undefined },
        { ...BEFORE, durationSeconds: null }
      )
    ).toBe(false)
    expect(hasMetadataChanges(BEFORE, { ...BEFORE })).toBe(false)
  })
})
