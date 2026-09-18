import { describe, expect, it } from 'vitest'
import {
  parseIsoDuration,
  parseMetadata,
  resolveUrl
} from '../../src/main/services/metadata-parser'

const page = `<!doctype html>
<html><head>
  <title>Fallback Title</title>
  <meta property="og:site_name" content="Example" />
  <meta property="og:title" content="OG Title" />
  <meta name="twitter:title" content="Twitter Title" />
  <meta property="og:description" content="A description" />
  <meta property="og:image" content="/images/cover.png" />
  <meta name="twitter:image" content="https://cdn.example.com/twitter.png" />
  <meta property="og:type" content="article" />
  <meta property="og:author" content="Jane Doe" />
</head><body><h1>H1</h1></body></html>`

describe('parseMetadata', () => {
  it('prefers og:title and resolves relative images', () => {
    const meta = parseMetadata(page, 'https://example.com/post')
    expect(meta.title).toBe('OG Title')
    expect(meta.description).toBe('A description')
    expect(meta.thumbnailUrl).toBe('https://example.com/images/cover.png')
    expect(meta.siteName).toBe('Example')
    expect(meta.ogType).toBe('article')
    expect(meta.author).toBe('Jane Doe')
  })

  it('reads twitter tags from name attributes', () => {
    const html = `
      <meta name="twitter:title" content="T Only" />
      <meta name="twitter:description" content="D" />
      <meta name="twitter:image" content="https://x.example/y.png" />`
    const meta = parseMetadata(html, 'https://example.com')
    expect(meta.title).toBe('T Only')
    expect(meta.description).toBe('D')
    expect(meta.thumbnailUrl).toBe('https://x.example/y.png')
  })

  it('falls back to title and then h1', () => {
    expect(parseMetadata('<title>Just a title</title>', 'https://e.com').title).toBe(
      'Just a title'
    )
    expect(parseMetadata('<h1>Heading here</h1>', 'https://e.com').title).toBe('Heading here')
  })

  it('drops a title that equals the site name', () => {
    const html =
      '<meta property="og:site_name" content="Example" /><meta property="og:title" content="Example" />'
    expect(parseMetadata(html, 'https://e.com').title).toBeNull()
  })

  it('reads the YouTube channel name from itemprop microdata', () => {
    const html =
      '<meta property="og:site_name" content="YouTube" /><link itemprop="name" content="Rick Astley" /><meta property="og:title" content="Never Gonna Give You Up" />'
    const meta = parseMetadata(html, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(meta.author).toBe('Rick Astley')
  })

  it('does not use microdata names on non-YouTube hosts', () => {
    const html = '<link itemprop="name" content="Not A Channel" />'
    expect(parseMetadata(html, 'https://example.com/post').author).toBeNull()
  })

  it('extracts the duration and channel url from a YouTube watch page', () => {
    const html = `
      <meta property="og:site_name" content="YouTube" />
      <link itemprop="name" content="Rick Astley" />
      <link itemprop="url" href="https://www.youtube.com/@RickAstleyYT" />
      <meta itemprop="duration" content="PT3M33S" />`
    const meta = parseMetadata(html, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(meta.durationSeconds).toBe(213)
    expect(meta.channelUrl).toBe('https://www.youtube.com/@RickAstleyYT')
  })

  it('falls back to og:video:duration seconds when microdata is absent', () => {
    const html = '<meta property="og:video:duration" content="253" />'
    expect(
      parseMetadata(html, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ').durationSeconds
    ).toBe(253)
  })

  it('ignores YouTube microdata on other hosts', () => {
    const html =
      '<link itemprop="url" href="https://www.youtube.com/@nope" /><meta itemprop="duration" content="PT1M" />'
    const meta = parseMetadata(html, 'https://example.com/post')
    expect(meta.durationSeconds).toBeNull()
    expect(meta.channelUrl).toBeNull()
  })

  it('returns empty metadata for empty input', () => {
    expect(parseMetadata('', 'https://e.com')).toEqual({
      title: null,
      description: null,
      thumbnailUrl: null,
      author: null,
      siteName: null,
      ogType: null,
      durationSeconds: null,
      channelUrl: null
    })
  })
})

describe('parseIsoDuration', () => {
  it('parses hours, minutes and seconds', () => {
    expect(parseIsoDuration('PT4M13S')).toBe(253)
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723)
    expect(parseIsoDuration('PT45S')).toBe(45)
  })

  it('returns null for invalid input', () => {
    expect(parseIsoDuration(null)).toBeNull()
    expect(parseIsoDuration('nope')).toBeNull()
    expect(parseIsoDuration('PT')).toBeNull()
  })
})

describe('resolveUrl', () => {
  it('resolves relative and absolute URLs', () => {
    expect(resolveUrl('/a.png', 'https://example.com/x/y')).toBe('https://example.com/a.png')
    expect(resolveUrl('https://cdn.example/x.png', 'https://example.com')).toBe(
      'https://cdn.example/x.png'
    )
  })

  it('returns null for empty or invalid input', () => {
    expect(resolveUrl('', 'https://example.com')).toBeNull()
    expect(resolveUrl(null, 'https://example.com')).toBeNull()
    expect(resolveUrl(undefined, 'https://example.com')).toBeNull()
  })
})
