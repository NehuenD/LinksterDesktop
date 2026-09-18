/**
 * YouTube video URL detection and canonicalization. Videos arrive as watch
 * links, short links, shorts, embeds and live URLs; all of them canonicalize to
 * one watch URL so the same video dedupes to a single row.
 */

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be'
])

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
/** Reserved path segments that look like ids but are playlists, not videos. */
const RESERVED_IDS = new Set(['videoseries'])

export interface YouTubeVideoRef {
  videoId: string
  canonicalUrl: string
  /** Shape the URL arrived in, preserved for the section badge. */
  origin: 'video' | 'shorts' | 'live' | 'embed' | 'music'
  /** Playlist context (`list=` param on a watch URL), dropped from the canonical URL. */
  playlistId: string | null
}

export function isYouTubeHost(host: string): boolean {
  return YOUTUBE_HOSTS.has(host.toLowerCase())
}

export function parseYouTubeVideoUrl(raw: string): YouTubeVideoRef | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  const protocol = parsed.protocol.toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:') return null
  const host = parsed.hostname.toLowerCase()
  if (!YOUTUBE_HOSTS.has(host)) return null

  const path = parsed.pathname.replace(/\/+$/, '') || '/'
  const lowerPath = path.toLowerCase()

  const videoId = (() => {
    if (host === 'youtu.be' || host === 'www.youtu.be') {
      return path.split('/').filter((segment) => segment.length > 0)[0] ?? null
    }
    if (lowerPath === '/watch') {
      return parsed.searchParams.get('v')
    }
    const match = path.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/i)
    return match?.[1] ?? null
  })()

  if (!videoId || RESERVED_IDS.has(videoId.toLowerCase())) return null
  if (!VIDEO_ID_PATTERN.test(videoId)) return null

  const origin = ((): YouTubeVideoRef['origin'] => {
    if (host === 'music.youtube.com') return 'music'
    if (host === 'youtu.be' || host === 'www.youtu.be') return 'video'
    if (lowerPath === '/watch') return 'video'
    if (lowerPath.startsWith('/shorts/')) return 'shorts'
    if (lowerPath.startsWith('/live/')) return 'live'
    return 'embed'
  })()

  const playlistId =
    lowerPath === '/watch' ? (parsed.searchParams.get('list') ?? null) : null

  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    origin,
    playlistId: playlistId && playlistId.trim().length > 0 ? playlistId : null
  }
}

/**
 * Ordered poster candidates for a video card: the stored (og:image) thumbnail
 * first when present, then the id-derived quality ladder. Duplicates removed so
 * a card's onError handler can walk the list without re-trying the same URL.
 */
export function youtubeThumbnailSources(
  videoId: string | null,
  thumbnailUrl: string | null
): string[] {
  const derived = videoId
    ? [
        `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
      ]
    : []
  const candidates = thumbnailUrl ? [thumbnailUrl, ...derived] : derived
  return [...new Set(candidates)]
}
