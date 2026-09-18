import { describe, expect, it } from 'vitest'
import { parse } from 'node-html-parser'
import { classifyPage, extractContent } from '../../src/main/services/content-extractor'
import type { LinkMetadata } from '../../src/main/services/metadata-parser'

const BASE_URL = 'https://example.com/post'

function meta(overrides: Partial<LinkMetadata> = {}): LinkMetadata {
  return {
    title: 'Example',
    description: null,
    thumbnailUrl: null,
    author: null,
    siteName: null,
    ogType: 'article',
    durationSeconds: null,
    channelUrl: null,
    ...overrides
  }
}

const PARAGRAPH =
  'The quick brown fox jumps over the lazy dog and keeps on running through the wide green field today'

function articleBody(paragraphs: number): string {
  return Array.from({ length: paragraphs }, () => `<p>${PARAGRAPH}</p>`).join('')
}

const ARTICLE_HTML = `<html><head><title>Example</title></head><body>
  <nav><a href="/">Home</a> <a href="/about">About</a></nav>
  <article>
    <h1>Example article</h1>
    ${articleBody(8)}
    <script>alert('xss')</script>
    <p onclick="steal()">Paragraph with an inline handler and enough words to be considered real content for scoring purposes here</p>
    <img src="/cover.png" alt="cover" />
    <img src="https://tracker.example/pixel.gif" width="1" height="1" />
    <a href="javascript:alert(1)">bad link</a>
    <a href="/more">good link</a>
  </article>
  <footer>Footer noise</footer>
</body></html>`

describe('classifyPage', () => {
  it('detects media by og:type', () => {
    expect(classifyPage(meta({ ogType: 'video.other' }), 'https://example.com/watch')).toBe('media')
    expect(classifyPage(meta({ ogType: 'music.song' }), 'https://example.com/track')).toBe('media')
  })

  it('detects media by known host', () => {
    expect(classifyPage(meta(), 'https://www.youtube.com/watch?v=abc')).toBe('media')
    expect(classifyPage(meta(), 'https://youtu.be/abc')).toBe('media')
    expect(classifyPage(meta(), 'https://vimeo.com/12345')).toBe('media')
  })

  it('detects non-article objects', () => {
    expect(classifyPage(meta({ ogType: 'product' }), 'https://shop.example/p/1')).toBe('other')
  })

  it('defaults to article', () => {
    expect(classifyPage(meta(), 'https://example.com/post')).toBe('article')
  })
})

describe('extractContent', () => {
  it('extracts a readable, sanitized article', () => {
    const result = extractContent(parse(ARTICLE_HTML), BASE_URL, meta())

    expect(result.status).toBe('ok')
    expect(result.wordCount).toBeGreaterThanOrEqual(140)
    expect(result.contentHtml).toContain('<p>')
    expect(result.contentText).toContain('quick brown fox')
  })

  it('strips scripts, event handlers and javascript: URLs', () => {
    const html = extractContent(parse(ARTICLE_HTML), BASE_URL, meta()).contentHtml ?? ''

    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('javascript:')
  })

  it('drops tracking pixels and resolves relative URLs', () => {
    const html = extractContent(parse(ARTICLE_HTML), BASE_URL, meta()).contentHtml ?? ''

    expect(html).not.toContain('pixel.gif')
    expect(html).toContain('src="https://example.com/cover.png"')
    expect(html).toContain('href="https://example.com/more"')
  })

  it('returns media status without a body for video pages', () => {
    const result = extractContent(
      parse(ARTICLE_HTML),
      'https://www.youtube.com/watch?v=abc',
      meta({ ogType: 'video.other' })
    )

    expect(result.status).toBe('media')
    expect(result.contentHtml).toBeNull()
    expect(result.contentText).toBeNull()
  })

  it('falls back to the body when no narrow candidate is dense enough', () => {
    const html = `<html><body><article><p>tiny</p></article><section>${articleBody(8)}</section></body></html>`
    const result = extractContent(parse(html), BASE_URL, meta())

    expect(result.status).toBe('ok')
    expect(result.wordCount).toBeGreaterThanOrEqual(140)
  })

  it('returns empty for pages with too little content', () => {
    const result = extractContent(
      parse('<html><body><article><p>Too short.</p></article></body></html>'),
      BASE_URL,
      meta()
    )

    expect(result.status).toBe('empty')
    expect(result.contentHtml).toBeNull()
  })
})
