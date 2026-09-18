import { describe, expect, it, vi } from 'vitest'
import {
  expandTcoLink,
  isMediaOrInternalLink,
  parseXOEmbed,
  xPostExternalLinks
} from '../../src/main/services/x-embed'

const JACK_HTML =
  '<blockquote class="twitter-tweet" data-dnt="true"><p lang="en" dir="ltr">just setting up my twttr</p>&mdash; jack (@jack) <a href="https://x.com/jack/status/20?ref_src=twsrc%5Etfw">March 21, 2006</a></blockquote>'

const MEDIA_HTML =
  '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Sunsets don&#39;t get much better than this one over <a href="https://x.com/GrandTetonNPS?ref_src=twsrc%5Etfw">@GrandTetonNPS</a>. <a href="https://x.com/hashtag/nature?src=hash&amp;ref_src=twsrc%5Etfw">#nature</a> <a href="https://x.com/hashtag/sunset?src=hash&amp;ref_src=twsrc%5Etfw">#sunset</a> <a href="https://t.co/YuKy2rcjyU">pic.x.com/YuKy2rcjyU</a></p>&mdash; US Department of the Interior (@Interior) <a href="https://x.com/Interior/status/463440424141459456?ref_src=twsrc%5Etfw">May 5, 2014</a></blockquote>'

const LINK_HTML =
  '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">The ETF market is getting weirder and weirder. Read about it here: <a href="https://t.co/K8SnbtukDh">https://t.co/K8SnbtukDh</a></p>&mdash; Ian Leonard (@LennyMadeThat) <a href="https://x.com/LennyMadeThat/status/2094212260873003505?ref_src=twsrc%5Etfw">August 30, 2026</a></blockquote>'

const MULTI_HTML =
  '<blockquote class="twitter-tweet"><p lang="en" dir="ltr"><a href="https://x.com/goaxil?ref_src=twsrc%5Etfw">@goaxil</a> is running a 50% off sale. <br><br>Axil - XCOR <a href="https://t.co/L9cBY5dVut">https://t.co/L9cBY5dVut</a> <br><br>GS EXTREME <a href="https://t.co/cULGIgzCnU">https://t.co/cULGIgzCnU</a> <br><br>EARMUFFS <a href="https://t.co/zIQvBg1Npy">https://t.co/zIQvBg1Npy</a> <a href="https://t.co/f4JjvDkAn7">pic.twitter.com/f4JjvDkAn7</a></p>&mdash; Jesse B (@JesseBOutdoors) <a href="https://x.com/JesseBOutdoors/status/1827694936503849309?ref_src=twsrc%5Etfw">August 25, 2024</a></blockquote>'

describe('parseXOEmbed', () => {
  it('maps author, handle, text and posted date from an oEmbed payload', () => {
    const post = parseXOEmbed('20', {
      author_name: 'jack',
      author_url: 'https://x.com/jack',
      html: JACK_HTML
    })

    expect(post).toEqual({
      tweetId: '20',
      authorName: 'jack',
      authorHandle: 'jack',
      text: 'just setting up my twttr',
      html: JACK_HTML,
      postedAt: '2006-03-21T00:00:00.000Z'
    })
  })

  it('decodes entities and keeps mentions, hashtags and media text in the body', () => {
    const post = parseXOEmbed('463440424141459456', {
      author_name: 'US Department of the Interior',
      author_url: 'https://x.com/Interior',
      html: MEDIA_HTML
    })

    expect(post?.text).toContain("Sunsets don't get much better than this one over @GrandTetonNPS.")
    expect(post?.text).toContain('#nature')
    expect(post?.text).toContain('pic.x.com/YuKy2rcjyU')
    expect(post?.postedAt).toBe('2014-05-05T00:00:00.000Z')
  })

  it('returns null for payloads without usable html', () => {
    expect(parseXOEmbed('20', null)).toBeNull()
    expect(parseXOEmbed('20', 'not json')).toBeNull()
    expect(parseXOEmbed('20', {})).toBeNull()
    expect(parseXOEmbed('20', { html: '   ' })).toBeNull()
  })

  it('tolerates a missing author url and unparseable date', () => {
    const post = parseXOEmbed('20', {
      author_name: 'jack',
      html: '<blockquote class="twitter-tweet"><p>hi</p>&mdash; jack <a href="https://x.com/jack/status/20">soon</a></blockquote>'
    })
    expect(post?.authorHandle).toBeNull()
    expect(post?.postedAt).toBeNull()
  })

  it('leaves the text empty when the blockquote has no paragraph', () => {
    const post = parseXOEmbed('20', { html: '<blockquote class="twitter-tweet"></blockquote>' })
    expect(post?.text).toBeNull()
  })
})

describe('xPostExternalLinks', () => {
  it('returns the external t.co anchor of a link tweet', () => {
    expect(xPostExternalLinks(LINK_HTML)).toEqual(['https://t.co/K8SnbtukDh'])
  })

  it('drops mentions, hashtags, media and the permalink', () => {
    expect(xPostExternalLinks(MEDIA_HTML)).toEqual([])
  })

  it('keeps every non-media link in document order', () => {
    expect(xPostExternalLinks(MULTI_HTML)).toEqual([
      'https://t.co/L9cBY5dVut',
      'https://t.co/cULGIgzCnU',
      'https://t.co/zIQvBg1Npy'
    ])
  })

  it('accepts direct external anchors and dedupes repeats', () => {
    const html =
      '<blockquote><p><a href="https://example.com/a">one</a> <a href="https://example.com/a">again</a> <a href="https://example.com/b">two</a></p></blockquote>'
    expect(xPostExternalLinks(html)).toEqual(['https://example.com/a', 'https://example.com/b'])
  })
})

describe('isMediaOrInternalLink', () => {
  it('flags X hosts as internal and pic hosts as media', () => {
    expect(isMediaOrInternalLink('https://x.com/a/status/1')).toBe(true)
    expect(isMediaOrInternalLink('https://twitter.com/jack')).toBe(true)
    expect(isMediaOrInternalLink('https://pic.twitter.com/abc')).toBe(true)
    expect(isMediaOrInternalLink('https://pic.x.com/abc')).toBe(true)
    expect(isMediaOrInternalLink('https://example.com/story')).toBe(false)
    expect(isMediaOrInternalLink('not a url')).toBe(true)
  })
})

describe('expandTcoLink', () => {
  const allowAll = async (): Promise<boolean> => true

  it('follows redirects to the final external URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'https://example.com/story' } })
      )
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    await expect(
      expandTcoLink('https://t.co/abc', {
        fetch: fetchMock as unknown as typeof fetch,
        isHostAllowed: allowAll
      })
    ).resolves.toBe('https://example.com/story')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns the URL directly when it is already final', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    await expect(
      expandTcoLink('https://example.com/story', {
        fetch: fetchMock as unknown as typeof fetch,
        isHostAllowed: allowAll
      })
    ).resolves.toBe('https://example.com/story')
  })

  it('refuses hops whose host is not allowed', async () => {
    const fetchMock = vi.fn()
    await expect(
      expandTcoLink('https://t.co/abc', {
        fetch: fetchMock as unknown as typeof fetch,
        isHostAllowed: async () => false
      })
    ).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gives up after the redirect cap', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://t.co/loop' } })
    )
    await expect(
      expandTcoLink('https://t.co/loop', {
        fetch: fetchMock as unknown as typeof fetch,
        isHostAllowed: allowAll,
        maxRedirects: 3
      })
    ).resolves.toBeNull()
  })
})
