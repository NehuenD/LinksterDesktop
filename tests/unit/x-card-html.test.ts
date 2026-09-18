import { describe, expect, it } from 'vitest'
import { buildFallbackCardHtml } from '../../src/main/services/x-card-html'

const INPUT = {
  authorName: 'jack <script>alert(1)</script>',
  authorHandle: 'jack',
  text: 'just setting up my twttr & more',
  postedAt: '2006-03-21T00:00:00.000Z',
  url: 'https://x.com/jack/status/20',
  relatedUrl: 'https://example.com/story?a=1&b=2'
}

describe('buildFallbackCardHtml', () => {
  it('renders an escaped, script-free card', () => {
    const html = buildFallbackCardHtml(INPUT)

    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp; more')
    expect(html).toContain('@jack')
    expect(html).toContain('March 21, 2006')
    expect(html).toContain('https://x.com/jack/status/20')
    expect(html).toContain('https://example.com/story?a=1&amp;b=2')
  })

  it('uses placeholders for missing metadata and omits the related link', () => {
    const html = buildFallbackCardHtml({
      ...INPUT,
      authorName: null,
      authorHandle: null,
      text: null,
      postedAt: null,
      relatedUrl: null
    })

    expect(html).toContain('X post')
    expect(html).toContain('(no text captured)')
    expect(html).not.toContain('Contains link')
  })
})
