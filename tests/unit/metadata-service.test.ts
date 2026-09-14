import { describe, expect, it, vi } from 'vitest'
import { fetchMetadata } from '../../src/main/services/metadata-service'

function htmlResponse(
  body: string,
  headers: Record<string, string> = { 'content-type': 'text/html' }
): Response {
  return new Response(body, { status: 200, headers })
}

const emptyMetadata = {
  title: null,
  description: null,
  thumbnailUrl: null,
  author: null,
  siteName: null,
  ogType: null
}

describe('fetchMetadata', () => {
  it('parses a page and resolves a relative image against the final URL', async () => {
    const fakeFetch = vi.fn(async () =>
      htmlResponse(
        '<meta property="og:title" content="Hello" /><meta property="og:image" content="/a.png" />'
      )
    )

    const meta = await fetchMetadata('https://example.com/post', {
      fetch: fakeFetch as unknown as typeof fetch
    })

    expect(meta.title).toBe('Hello')
    expect(meta.thumbnailUrl).toBe('https://example.com/a.png')
  })

  it('returns empty metadata for non-html content types', async () => {
    const fakeFetch = vi.fn(async () =>
      htmlResponse('binary', { 'content-type': 'image/png' })
    )
    const meta = await fetchMetadata('https://example.com/a.png', {
      fetch: fakeFetch as unknown as typeof fetch
    })
    expect(meta).toEqual(emptyMetadata)
  })

  it('returns empty metadata for non-ok responses', async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response('nope', { status: 500, headers: { 'content-type': 'text/html' } })
    )
    const meta = await fetchMetadata('https://example.com', {
      fetch: fakeFetch as unknown as typeof fetch
    })
    expect(meta).toEqual(emptyMetadata)
  })

  it('returns empty metadata when the request throws', async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error('network down')
    })
    const meta = await fetchMetadata('https://example.com', {
      fetch: fakeFetch as unknown as typeof fetch
    })
    expect(meta).toEqual(emptyMetadata)
  })
})
