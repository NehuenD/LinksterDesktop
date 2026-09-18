import { describe, expect, it, vi } from 'vitest'
import { fetchMetadata, fetchPageData } from '../../src/main/services/metadata-service'
import { isPrivateHost } from '../../src/main/services/url-validator'

function htmlResponse(
  body: string,
  headers: Record<string, string> = { 'content-type': 'text/html' }
): Response {
  return new Response(body, { status: 200, headers })
}

function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { location } })
}

const allowAll = async (): Promise<boolean> => true
const allowPublic = async (host: string): Promise<boolean> => !isPrivateHost(host)

const emptyMetadata = {
  title: null,
  description: null,
  thumbnailUrl: null,
  author: null,
  siteName: null,
  ogType: null,
  durationSeconds: null,
  channelUrl: null
}

describe('fetchMetadata', () => {
  it('parses a page and resolves a relative image against the final URL', async () => {
    const fakeFetch = vi.fn(async () =>
      htmlResponse(
        '<meta property="og:title" content="Hello" /><meta property="og:image" content="/a.png" />'
      )
    )

    const meta = await fetchMetadata('https://example.com/post', {
      fetch: fakeFetch as unknown as typeof fetch,
      isHostAllowed: allowAll
    })

    expect(meta.title).toBe('Hello')
    expect(meta.thumbnailUrl).toBe('https://example.com/a.png')
  })

  it('returns empty metadata for non-html content types', async () => {
    const fakeFetch = vi.fn(async () =>
      htmlResponse('binary', { 'content-type': 'image/png' })
    )
    const meta = await fetchMetadata('https://example.com/a.png', {
      fetch: fakeFetch as unknown as typeof fetch,
      isHostAllowed: allowAll
    })
    expect(meta).toEqual(emptyMetadata)
  })

  it('returns empty metadata for non-ok responses', async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response('nope', { status: 500, headers: { 'content-type': 'text/html' } })
    )
    const meta = await fetchMetadata('https://example.com', {
      fetch: fakeFetch as unknown as typeof fetch,
      isHostAllowed: allowAll
    })
    expect(meta).toEqual(emptyMetadata)
  })

  it('returns empty metadata when the request throws', async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error('network down')
    })
    const meta = await fetchMetadata('https://example.com', {
      fetch: fakeFetch as unknown as typeof fetch,
      isHostAllowed: allowAll
    })
    expect(meta).toEqual(emptyMetadata)
  })
})

describe('fetchMetadata redirects', () => {
  it('requests redirects manually', async () => {
    const fakeFetch = vi.fn(async () =>
      htmlResponse('<meta property="og:title" content="Hi" />')
    )
    await fetchMetadata('https://example.com/post', {
      fetch: fakeFetch as unknown as typeof fetch,
      isHostAllowed: allowAll
    })
    expect(fakeFetch).toHaveBeenCalledWith(
      'https://example.com/post',
      expect.objectContaining({ redirect: 'manual' })
    )
  })

  it('follows a public redirect and parses metadata from the destination', async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('https://news.example.com/article'))
      .mockResolvedValueOnce(
        htmlResponse('<meta property="og:title" content="Deep" /><meta property="og:image" content="/cover.png" />')
      )

    const meta = await fetchMetadata('https://exa.mple/short', {
      fetch: fakeFetch as unknown as typeof fetch,
      isHostAllowed: allowPublic
    })

    expect(meta.title).toBe('Deep')
    expect(meta.thumbnailUrl).toBe('https://news.example.com/cover.png')
    expect(fakeFetch).toHaveBeenCalledTimes(2)
  })

  it('refuses a redirect to a private address', async () => {
    const fakeFetch = vi.fn(async (url: string) =>
      url.includes('169.254')
        ? htmlResponse('<meta property="og:title" content="Leaked" />')
        : redirectResponse('http://169.254.169.254/latest/meta-data')
    )

    const page = await fetchPageData('https://exa.mple/short', {
      fetch: fakeFetch as unknown as typeof fetch,
      isHostAllowed: allowPublic
    })

    expect(page.metadata).toEqual(emptyMetadata)
    // The private hop must never be requested.
    expect(fakeFetch).toHaveBeenCalledTimes(1)
  })

  it('gives up after too many redirects', async () => {
    const fakeFetch = vi.fn(async () => redirectResponse('https://example.com/loop'))
    const meta = await fetchMetadata('https://example.com/start', {
      fetch: fakeFetch as unknown as typeof fetch,
      isHostAllowed: allowAll
    })
    expect(meta).toEqual(emptyMetadata)
    expect(fakeFetch.mock.calls.length).toBeLessThanOrEqual(6)
  })

  it('refuses a redirect without a location header', async () => {
    const fakeFetch = vi.fn(async () => new Response(null, { status: 302 }))
    const meta = await fetchMetadata('https://example.com/start', {
      fetch: fakeFetch as unknown as typeof fetch,
      isHostAllowed: allowAll
    })
    expect(meta).toEqual(emptyMetadata)
  })
})
