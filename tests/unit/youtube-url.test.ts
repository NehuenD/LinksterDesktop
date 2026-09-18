import { describe, expect, it } from 'vitest'
import {
  isYouTubeHost,
  parseYouTubeVideoUrl,
  youtubeThumbnailSources
} from '@shared/lib/youtube-url'

const ID = 'dQw4w9WgXcQ'
const CANONICAL = `https://www.youtube.com/watch?v=${ID}`

describe('parseYouTubeVideoUrl', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://www.youtu.be/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://www.youtube.com/v/${ID}`,
    `https://www.youtube.com/watch/?v=${ID}`,
    `https://www.youtube.com/WATCH?v=${ID}`,
    `https://WWW.YOUTUBE-NOCOOKIE.COM/EMBED/${ID}`
  ])('canonicalizes %s', (input) => {
    const parsed = parseYouTubeVideoUrl(input)
    expect(parsed?.videoId).toBe(ID)
    expect(parsed?.canonicalUrl).toBe(CANONICAL)
  })

  it('ignores tracking and playback params', () => {
    expect(
      parseYouTubeVideoUrl(`https://youtu.be/${ID}?si=abc&t=42`)?.canonicalUrl
    ).toBe(CANONICAL)
    expect(
      parseYouTubeVideoUrl(`https://www.youtube.com/watch?list=PL123&v=${ID}&t=42s#frag`)
        ?.canonicalUrl
    ).toBe(CANONICAL)
  })

  it('accepts mixed-case hosts', () => {
    expect(parseYouTubeVideoUrl(`https://WWW.YouTube.COM/watch?v=${ID}`)?.videoId).toBe(ID)
  })

  it.each([
    'https://www.youtube.com/',
    `https://www.youtube.com/@channel`,
    `https://www.youtube.com/playlist?list=PL123`,
    `https://www.youtube.com/watch?v=tooshort`,
    `https://www.youtube.com/watch?v=${ID}extra`,
    `https://www.youtube.com/watch`,
    `https://youtu.be/`,
    `https://example.com/watch?v=${ID}`,
    `https://vimeo.com/${ID}`,
    'https://www.youtube.com/embed/videoseries?list=PL123',
    `https://www.youtube.com/shorts/${ID}extra`,
    'not a url',
    ''
  ])('returns null for non-video input: %s', (input) => {
    expect(parseYouTubeVideoUrl(input)).toBeNull()
  })
})

describe('isYouTubeHost', () => {
  it('matches YouTube hosts only', () => {
    expect(isYouTubeHost('youtu.be')).toBe(true)
    expect(isYouTubeHost('Music.YouTube.com')).toBe(true)
    expect(isYouTubeHost('vimeo.com')).toBe(false)
    expect(isYouTubeHost('notyoutube.com')).toBe(false)
  })
})

describe('parseYouTubeVideoUrl origin', () => {
  it('records the origin shape without changing the canonical url', () => {
    expect(parseYouTubeVideoUrl(`https://www.youtube.com/shorts/${ID}`)?.origin).toBe('shorts')
    expect(parseYouTubeVideoUrl(`https://www.youtube.com/live/${ID}`)?.origin).toBe('live')
    expect(parseYouTubeVideoUrl(`https://music.youtube.com/watch?v=${ID}`)?.origin).toBe('music')
    expect(parseYouTubeVideoUrl(`https://www.youtube.com/watch?v=${ID}`)?.origin).toBe('video')
    expect(parseYouTubeVideoUrl(`https://youtu.be/${ID}`)?.origin).toBe('video')
  })

  it('captures the playlist id when a watch url carries one', () => {
    expect(
      parseYouTubeVideoUrl(`https://www.youtube.com/watch?v=${ID}&list=PL123`)?.playlistId
    ).toBe('PL123')
    expect(parseYouTubeVideoUrl(`https://youtu.be/${ID}`)?.playlistId).toBeNull()
  })
})

describe('youtubeThumbnailSources', () => {
  it('falls back through maxres, hq and mq for a parsed video id', () => {
    expect(youtubeThumbnailSources(ID, null)).toEqual([
      `https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`,
      `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`
    ])
  })

  it('tries the stored thumbnail first and never repeats a candidate', () => {
    const stored = `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`
    expect(youtubeThumbnailSources(ID, stored)).toEqual([
      stored,
      `https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`
    ])
  })

  it('keeps a stored thumbnail when no video id is available', () => {
    expect(youtubeThumbnailSources(null, 'https://example.com/thumb.jpg')).toEqual([
      'https://example.com/thumb.jpg'
    ])
  })

  it('returns no sources when neither a thumbnail nor an id exists', () => {
    expect(youtubeThumbnailSources(null, null)).toEqual([])
  })
})
