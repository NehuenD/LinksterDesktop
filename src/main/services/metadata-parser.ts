import { parse, type HTMLElement } from 'node-html-parser'
import { isYouTubeHost } from '@shared/lib/youtube-url'

export interface LinkMetadata {
  title: string | null
  description: string | null
  thumbnailUrl: string | null
  author: string | null
  siteName: string | null
  ogType: string | null
  /** Video length in seconds when the page exposes it (YouTube). */
  durationSeconds: number | null
  /** Channel/profile identity when the page exposes it (YouTube microdata). */
  channelUrl: string | null
}

export function emptyMetadata(): LinkMetadata {
  return {
    title: null,
    description: null,
    thumbnailUrl: null,
    author: null,
    siteName: null,
    ogType: null,
    durationSeconds: null,
    channelUrl: null
  }
}

/** Parses ISO-8601 video durations ("PT4M13S"); null when unparseable. */
export function parseIsoDuration(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.trim().match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
  if (!match) return null
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)
  const total = hours * 3600 + minutes * 60 + seconds
  return total > 0 ? total : null
}

export function resolveUrl(
  candidate: string | null | undefined,
  baseUrl: string
): string | null {
  if (!candidate) return null
  const trimmed = candidate.trim()
  if (trimmed.length === 0) return null
  try {
    return new URL(trimmed, baseUrl).toString()
  } catch {
    return null
  }
}

function clean(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function collectMeta(root: HTMLElement): Map<string, string> {
  const map = new Map<string, string>()
  for (const element of root.querySelectorAll('meta')) {
    const key = (element.getAttribute('property') ?? element.getAttribute('name') ?? '')
      .trim()
      .toLowerCase()
    const content = element.getAttribute('content')
    if (key.length > 0 && content !== undefined && content !== null && !map.has(key)) {
      map.set(key, content)
    }
  }
  return map
}

function firstMeta(meta: Map<string, string>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = meta.get(key)
    const cleaned = clean(value)
    if (cleaned) return cleaned
  }
  return null
}

function textOf(element: HTMLElement | null): string | null {
  if (!element) return null
  return clean(element.text)
}

function cleanTitle(rawTitle: string | null, siteName: string | null): string | null {
  const title = clean(rawTitle)
  if (!title) return null
  if (title.length < 3) return null
  if (siteName && title.toLowerCase() === siteName.toLowerCase()) return null
  return title
}

export function parseMetadata(html: string, baseUrl: string): LinkMetadata {
  let root: HTMLElement
  try {
    root = parse(html)
  } catch {
    return emptyMetadata()
  }

  return parseMetadataFromRoot(root, baseUrl)
}

/**
 * YouTube exposes the channel name only as microdata
 * (`<link itemprop="name" content="…">`), so the generic meta scan misses it.
 */
function youtubeChannel(root: HTMLElement, baseUrl: string): string | null {
  try {
    if (!isYouTubeHost(new URL(baseUrl).hostname)) return null
  } catch {
    return null
  }
  const element = root.querySelector('link[itemprop="name"]')
  return clean(element?.getAttribute('content') ?? null)
}

/** Duration (`itemprop="duration"` ISO-8601 or `og:video:duration`) and channel URL. */
function youtubeExtras(
  root: HTMLElement,
  baseUrl: string,
  meta: Map<string, string>
): { durationSeconds: number | null; channelUrl: string | null } {
  try {
    if (!isYouTubeHost(new URL(baseUrl).hostname)) {
      return { durationSeconds: null, channelUrl: null }
    }
  } catch {
    return { durationSeconds: null, channelUrl: null }
  }

  const microdata = root.querySelector('meta[itemprop="duration"]')?.getAttribute('content')
  const isoSeconds = parseIsoDuration(microdata)
  const ogSeconds = Number.parseInt(firstMeta(meta, ['og:video:duration']) ?? '', 10)
  const durationSeconds =
    isoSeconds ?? (Number.isFinite(ogSeconds) && ogSeconds > 0 ? ogSeconds : null)

  const channelUrl = resolveUrl(
    root.querySelector('link[itemprop="url"]')?.getAttribute('href'),
    baseUrl
  )

  return { durationSeconds, channelUrl }
}

export function parseMetadataFromRoot(root: HTMLElement, baseUrl: string): LinkMetadata {
  const meta = collectMeta(root)

  const siteName = clean(firstMeta(meta, ['og:site_name']))
  const ogType = clean(firstMeta(meta, ['og:type']))
  const author =
    clean(firstMeta(meta, ['og:author', 'article:author', 'author'])) ??
    youtubeChannel(root, baseUrl)

  const rawTitle =
    firstMeta(meta, ['title', 'og:title', 'twitter:title']) ??
    textOf(root.querySelector('title')) ??
    textOf(root.querySelector('h1'))
  const title = cleanTitle(rawTitle, siteName)

  const description = clean(
    firstMeta(meta, ['description', 'og:description', 'twitter:description'])
  )

  const imageRaw = firstMeta(meta, [
    'og:image',
    'og:image:url',
    'og:image:secure_url',
    'twitter:image',
    'twitter:image:src'
  ])
  const thumbnailUrl = resolveUrl(imageRaw, baseUrl)

  const extras = youtubeExtras(root, baseUrl, meta)

  return {
    title,
    description,
    thumbnailUrl,
    author,
    siteName,
    ogType,
    durationSeconds: extras.durationSeconds,
    channelUrl: extras.channelUrl
  }
}
