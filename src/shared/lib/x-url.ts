/**
 * X (Twitter) post URL detection and canonicalization. X serves the same post
 * under several hosts, path shapes and query-string variants; the canonical
 * form drops the handle so every mirror dedupes to one tweet.
 */

const X_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'mobile.x.com',
  'm.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
  'm.twitter.com'
])

const HANDLE_PATTERN = /^[a-z0-9_]{1,15}$/
const TWEET_ID_PATTERN = /^[1-9]\d*$/

/** True when the host belongs to X/Twitter (any mirror). */
export function isXHost(host: string): boolean {
  return X_HOSTS.has(host.toLowerCase())
}

export interface XPostRef {
  tweetId: string
  handle: string | null
  canonicalUrl: string
}

function segmentHandle(segment: string | undefined): string | null {
  if (!segment) return null
  const candidate = (segment.startsWith('@') ? segment.slice(1) : segment).toLowerCase()
  return HANDLE_PATTERN.test(candidate) ? candidate : null
}

export function parseXPostUrl(raw: string): XPostRef | null {
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
  if (!isXHost(parsed.hostname)) return null

  const segments = parsed.pathname.split('/').filter((segment) => segment.length > 0)

  let handle: string | null = null
  let statusIndex: number
  if (segments.length >= 2 && isStatusSegment(segments[1])) {
    handle = segmentHandle(segments[0])
    if (handle === null) return null
    statusIndex = 1
  } else if (segments.length >= 4 && isStatusSegment(segments[2])) {
    // /<handle|i>/web/status/<id> form used by the logged-in web app.
    handle = segmentHandle(segments[0])
    if (handle === null) return null
    statusIndex = 2
  } else if (segments.length >= 2 && isStatusSegment(segments[0])) {
    statusIndex = 0
  } else {
    return null
  }

  const tweetId = segments[statusIndex + 1] ?? ''
  if (!TWEET_ID_PATTERN.test(tweetId)) return null

  return {
    tweetId,
    handle,
    canonicalUrl: `https://x.com/i/status/${tweetId}`
  }
}

function isStatusSegment(segment: string): boolean {
  return segment === 'status' || segment === 'statuses'
}
