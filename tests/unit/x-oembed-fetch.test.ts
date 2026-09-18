import { describe, expect, it, vi } from 'vitest'
import type { XPostData } from '../../src/main/services/x-embed'
import { fetchXOEmbed } from '../../src/main/services/x-oembed-fetch'

const JACK_HTML =
  '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">just setting up my twttr</p>&mdash; jack (@jack) <a href="https://x.com/jack/status/20?ref_src=twsrc%5Etfw">March 21, 2006</a></blockquote>'

function oembedResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

const ALLOW_ALL = async (): Promise<boolean> => true

describe('fetchXOEmbed', () => {
  it('fetches and parses the payload from the primary endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        oembedResponse({ author_name: 'jack', author_url: 'https://x.com/jack', html: JACK_HTML })
      )

    const post = (await fetchXOEmbed('20', 'https://x.com/jack/status/20', {
      fetch: fetchMock as unknown as typeof fetch,
      isHostAllowed: ALLOW_ALL
    })) as XPostData

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calledUrl = String(fetchMock.mock.calls[0][0])
    expect(calledUrl).toContain('publish.twitter.com/oembed')
    expect(calledUrl).toContain('url=https%3A%2F%2Fx.com%2Fjack%2Fstatus%2F20')
    expect(post.authorHandle).toBe('jack')
    expect(post.text).toBe('just setting up my twttr')
  })

  it('falls back to the secondary endpoint when the first fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(oembedResponse({ error: 'not found' }, 404))
      .mockResolvedValueOnce(
        oembedResponse({ author_name: 'jack', author_url: 'https://x.com/jack', html: JACK_HTML })
      )

    const post = await fetchXOEmbed('20', 'https://x.com/jack/status/20', {
      fetch: fetchMock as unknown as typeof fetch,
      isHostAllowed: ALLOW_ALL
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('publish.x.com/oembed')
    expect(post?.authorHandle).toBe('jack')
  })

  it('returns null when no endpoint is reachable or parseable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(
      fetchXOEmbed('20', 'https://x.com/jack/status/20', {
        fetch: fetchMock as unknown as typeof fetch,
        isHostAllowed: ALLOW_ALL
      })
    ).resolves.toBeNull()
  })

  it('never issues a request when the endpoint host is not allowed', async () => {
    const fetchMock = vi.fn()
    const post = await fetchXOEmbed('20', 'https://x.com/jack/status/20', {
      fetch: fetchMock as unknown as typeof fetch,
      isHostAllowed: async () => false
    })

    expect(post).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
