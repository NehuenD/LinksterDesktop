import { describe, expect, it } from 'vitest'
import { canonicalizeLinkUrl, classifyLinkKind } from '@shared/lib/link-url'

const VIDEO_ID = 'dQw4w9WgXcQ'

describe('canonicalizeLinkUrl', () => {
  it('rewrites X mirrors to the handle-free canonical URL', () => {
    expect(canonicalizeLinkUrl('https://twitter.com/jack/status/20?ref_src=twsrc%5Etfw')).toBe(
      'https://x.com/i/status/20'
    )
    expect(canonicalizeLinkUrl('https://x.com/i/web/status/20')).toBe('https://x.com/i/status/20')
    expect(canonicalizeLinkUrl('https://x.com/jack/status/20')).toBe('https://x.com/i/status/20')
  })

  it('rewrites YouTube variants to one watch URL', () => {
    expect(canonicalizeLinkUrl(`https://youtu.be/${VIDEO_ID}?si=abc`)).toBe(
      `https://www.youtube.com/watch?v=${VIDEO_ID}`
    )
    expect(canonicalizeLinkUrl(`https://www.youtube.com/shorts/${VIDEO_ID}`)).toBe(
      `https://www.youtube.com/watch?v=${VIDEO_ID}`
    )
  })

  it('returns non-isolated URLs unchanged', () => {
    const url = 'https://Example.com/Path?utm_source=x#frag'
    expect(canonicalizeLinkUrl(url)).toBe(url)
  })

  it('returns invalid input unchanged', () => {
    expect(canonicalizeLinkUrl('  not a url  ')).toBe('  not a url  ')
  })
})

describe('classifyLinkKind', () => {
  it('classifies X posts, YouTube videos and everything else', () => {
    expect(classifyLinkKind('https://x.com/jack/status/20')).toBe('x-post')
    expect(classifyLinkKind('https://twitter.com/jack/status/20')).toBe('x-post')
    expect(classifyLinkKind(`https://youtu.be/${VIDEO_ID}`)).toBe('youtube')
    expect(classifyLinkKind(`https://www.youtube.com/watch?v=${VIDEO_ID}`)).toBe('youtube')
    expect(classifyLinkKind('https://www.youtube.com/@channel')).toBe('link')
    expect(classifyLinkKind('https://example.com/jack/status/20')).toBe('link')
  })
})
