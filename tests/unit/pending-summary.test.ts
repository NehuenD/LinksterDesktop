import { describe, expect, it } from 'vitest'
import { describePendingFailures } from '../../src/shared/lib/pending-summary'

describe('describePendingFailures', () => {
  it('names library links', () => {
    expect(describePendingFailures([{ url: 'https://example.com/a' }])).toBe('1 link')
    expect(
      describePendingFailures([
        { url: 'https://example.com/a' },
        { url: 'https://example.com/b' }
      ])
    ).toBe('2 links')
  })

  it('distinguishes X posts and videos', () => {
    expect(describePendingFailures([{ url: 'https://x.com/jack/status/20' }])).toBe('1 X post')
    expect(
      describePendingFailures([{ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }])
    ).toBe('1 video')
  })

  it('summarizes a mixed failure set', () => {
    expect(
      describePendingFailures([
        { url: 'https://x.com/jack/status/20' },
        { url: 'https://example.com/a' },
        { url: 'https://example.com/b' },
        { url: 'https://youtu.be/dQw4w9WgXcQ' }
      ])
    ).toBe('1 X post, 2 links, 1 video')
  })
})
