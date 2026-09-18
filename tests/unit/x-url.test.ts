import { describe, expect, it } from 'vitest'
import { parseXPostUrl } from '@shared/lib/x-url'

const CANONICAL = 'https://x.com/i/status/20'

describe('parseXPostUrl', () => {
  it('parses a canonical x.com post URL', () => {
    expect(parseXPostUrl('https://x.com/jack/status/20')).toEqual({
      tweetId: '20',
      handle: 'jack',
      canonicalUrl: CANONICAL
    })
  })

  it('maps twitter.com mirrors onto the handle-free canonical URL', () => {
    expect(parseXPostUrl('https://twitter.com/jack/status/20')?.canonicalUrl).toBe(CANONICAL)
    expect(parseXPostUrl('https://mobile.twitter.com/jack/status/20')?.canonicalUrl).toBe(
      CANONICAL
    )
    expect(parseXPostUrl('https://m.twitter.com/jack/status/20')?.canonicalUrl).toBe(CANONICAL)
    expect(parseXPostUrl('https://www.x.com/jack/status/20')?.canonicalUrl).toBe(CANONICAL)
    expect(parseXPostUrl('https://m.x.com/jack/status/20')?.canonicalUrl).toBe(CANONICAL)
  })

  it('ignores query strings and fragments used for tracking', () => {
    expect(parseXPostUrl('https://x.com/jack/status/20?s=20&t=abc#top')?.canonicalUrl).toBe(
      CANONICAL
    )
  })

  it('accepts legacy /statuses/ paths', () => {
    expect(parseXPostUrl('https://twitter.com/jack/statuses/20')?.tweetId).toBe('20')
    expect(parseXPostUrl('https://twitter.com/jack/statuses/20')?.canonicalUrl).toBe(CANONICAL)
  })

  it('accepts /i/status/ links and handle-less links', () => {
    expect(parseXPostUrl('https://x.com/i/status/20')?.handle).toBe('i')
    expect(parseXPostUrl('https://x.com/status/20')).toEqual({
      tweetId: '20',
      handle: null,
      canonicalUrl: CANONICAL
    })
  })

  it('accepts the /i/web/status/ form produced by the logged-in web app', () => {
    expect(parseXPostUrl('https://x.com/i/web/status/20')).toEqual({
      tweetId: '20',
      handle: 'i',
      canonicalUrl: CANONICAL
    })
    expect(parseXPostUrl('https://twitter.com/i/web/status/20')?.canonicalUrl).toBe(CANONICAL)
    expect(parseXPostUrl('https://x.com/i/web/status/20/photo/1')?.canonicalUrl).toBe(CANONICAL)
  })

  it('accepts @-prefixed handles', () => {
    expect(parseXPostUrl('https://x.com/@jack/status/20')?.canonicalUrl).toBe(CANONICAL)
  })

  it('strips trailing sub-paths like /photo/1 in the canonical URL', () => {
    expect(parseXPostUrl('https://x.com/jack/status/20/photo/1')?.canonicalUrl).toBe(CANONICAL)
  })

  it('lowercases handles so mixed-case mirrors dedupe', () => {
    expect(parseXPostUrl('https://x.com/Jack/status/20')?.handle).toBe('jack')
    expect(parseXPostUrl('https://x.com/Jack/status/20')?.canonicalUrl).toBe(CANONICAL)
  })

  it('rejects tweet ids with leading zeros', () => {
    expect(parseXPostUrl('https://x.com/jack/status/020')).toBeNull()
  })

  it.each([
    'https://x.com/jack',
    'https://x.com/jack/status',
    'https://x.com/jack/status/abc',
    'https://x.com/home',
    'https://example.com/jack/status/20',
    'https://fxtwitter.com/jack/status/20',
    'not a url',
    '',
    'javascript:alert(1)'
  ])('returns null for non-post input: %s', (input) => {
    expect(parseXPostUrl(input)).toBeNull()
  })
})
