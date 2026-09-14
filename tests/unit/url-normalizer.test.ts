import { describe, expect, it } from 'vitest'
import { normalizeUrl } from '../../src/main/data/url-normalizer'

describe('normalizeUrl', () => {
  it('lowercases the host and strips the fragment', () => {
    expect(normalizeUrl('https://Example.COM/Path#section')).toBe('https://example.com/Path')
  })

  it('removes tracking parameters but keeps meaningful ones', () => {
    expect(normalizeUrl('https://example.com/a?utm_source=x&id=5&fbclid=abc')).toBe(
      'https://example.com/a?id=5'
    )
  })

  it('trims trailing slashes on non-root paths', () => {
    expect(normalizeUrl('https://example.com/docs/')).toBe('https://example.com/docs')
  })

  it('returns trimmed input when it is not a URL', () => {
    expect(normalizeUrl('  not a url  ')).toBe('not a url')
  })

  it('returns an empty string unchanged', () => {
    expect(normalizeUrl('   ')).toBe('')
  })
})
