import { parse, type HTMLElement } from 'node-html-parser'
import { isXHost } from '@shared/lib/x-url'
import { DEFAULT_USER_AGENT } from './http-read'
import { assertPublicHost, validateUrl } from './url-validator'

/**
 * Tweet data derived from X's oEmbed endpoint. oEmbed is the metadata source
 * for X posts because the normal page HTML is a login wall.
 */
export interface XPostData {
  tweetId: string
  authorName: string | null
  authorHandle: string | null
  text: string | null
  html: string
  postedAt: string | null
}

export const X_OEMBED_ENDPOINTS = [
  'https://publish.twitter.com/oembed',
  'https://publish.x.com/oembed'
] as const

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function handleFromAuthorUrl(value: unknown): string | null {
  const authorUrl = clean(value)
  if (!authorUrl) return null

  try {
    const parsed = new URL(authorUrl)
    const segment = parsed.pathname.split('/').filter((part) => part.length > 0)[0] ?? ''
    const handle = segment.toLowerCase()
    return /^[a-z0-9_]{1,15}$/.test(handle) ? handle : null
  } catch {
    return null
  }
}

function textFromBlockquote(blockquote: HTMLElement): string | null {
  const paragraphs = blockquote.querySelectorAll('p')
  const raw =
    paragraphs.length > 0
      ? paragraphs.map((paragraph) => paragraph.text).join('\n')
      : blockquote.text
  const lines = raw
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
  return lines.length > 0 ? lines.join('\n') : null
}

/** The trailing permalink anchor carries the post date as its label. */
function parseTweetDate(blockquote: HTMLElement): string | null {
  const anchors = blockquote.querySelectorAll('a')
  for (let index = anchors.length - 1; index >= 0; index -= 1) {
    const label = anchors[index].text.trim()
    if (label.length === 0) continue
    const parsed = new Date(`${label} UTC`)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return null
}

export function parseXOEmbed(tweetId: string, payload: unknown): XPostData | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const html = typeof record.html === 'string' ? record.html.trim() : ''
  if (html.length === 0) return null

  let root: HTMLElement
  try {
    root = parse(html)
  } catch {
    return null
  }

  const blockquote =
    root.querySelector('blockquote.twitter-tweet') ?? root.querySelector('blockquote')

  return {
    tweetId,
    authorName: clean(record.author_name),
    authorHandle: handleFromAuthorUrl(record.author_url),
    text: blockquote ? textFromBlockquote(blockquote) : null,
    html,
    postedAt: blockquote ? parseTweetDate(blockquote) : null
  }
}

const MEDIA_HOSTS = new Set(['pic.twitter.com', 'pic.x.com', 'pbs.twimg.com'])
const MEDIA_ANCHOR_PATTERN = /^pic\.(?:twitter|x)\.com\//i

/** Internal X destinations (mentions, hashtags, permalinks) and media hosts. */
export function isMediaOrInternalLink(raw: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return true
  }
  const host = parsed.hostname.toLowerCase()
  return isXHost(host) || MEDIA_HOSTS.has(host)
}

/**
 * Ordered, deduplicated external links in a tweet's oEmbed HTML. Mentions,
 * hashtags, the status permalink and media (`pic.*`) anchors are dropped;
 * `t.co` shortlinks are kept for expansion.
 */
export function xPostExternalLinks(html: string): string[] {
  let root: HTMLElement
  try {
    root = parse(html)
  } catch {
    return []
  }

  const blockquote =
    root.querySelector('blockquote.twitter-tweet') ?? root.querySelector('blockquote') ?? root
  const results: string[] = []
  const seen = new Set<string>()

  for (const anchor of blockquote.querySelectorAll('a')) {
    const href = anchor.getAttribute('href')?.trim() ?? ''
    if (href.length === 0) continue
    if (MEDIA_ANCHOR_PATTERN.test(anchor.text.trim())) continue

    let parsed: URL
    try {
      parsed = new URL(href)
    } catch {
      continue
    }

    const host = parsed.hostname.toLowerCase()
    if (host !== 't.co' && isMediaOrInternalLink(href)) continue

    const normalized = parsed.toString()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    results.push(normalized)
  }

  return results
}

const MAX_TCO_REDIRECTS = 5
const TCO_TIMEOUT_MS = 15_000
const TCO_USER_AGENT = DEFAULT_USER_AGENT

export interface TcoExpandDeps {
  fetch: typeof fetch
  maxRedirects: number
  timeoutMs: number
  isHostAllowed: (host: string) => Promise<boolean>
}

export function resolveTcoExpandDeps(overrides: Partial<TcoExpandDeps> = {}): TcoExpandDeps {
  return {
    fetch: overrides.fetch ?? fetch,
    maxRedirects: overrides.maxRedirects ?? MAX_TCO_REDIRECTS,
    timeoutMs: overrides.timeoutMs ?? TCO_TIMEOUT_MS,
    isHostAllowed: overrides.isHostAllowed ?? assertPublicHost
  }
}

/**
 * Resolves a shortlink to its final URL, validating every hop against the SSRF
 * policy. Returns null when the chain is broken, private, or too long.
 */
export async function expandTcoLink(
  raw: string,
  overrides: Partial<TcoExpandDeps> = {}
): Promise<string | null> {
  const deps = resolveTcoExpandDeps(overrides)

  const validation = validateUrl(raw)
  if (!validation.valid) return null
  let current = validation.url

  for (let hop = 0; hop <= deps.maxRedirects; hop += 1) {
    let host: string
    try {
      host = new URL(current).hostname
    } catch {
      return null
    }
    if (!(await deps.isHostAllowed(host))) return null

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs)
    let response: Response
    try {
      response = await deps.fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': TCO_USER_AGENT, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' }
      })
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }

    // The body is never read; releasing it frees the socket immediately instead
    // of holding it until GC.
    try {
      await response.body?.cancel()
    } catch {
      // Cancellation is best-effort.
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return null
      let next: string
      try {
        next = new URL(location, current).toString()
      } catch {
        return null
      }
      const nextValidation = validateUrl(next)
      if (!nextValidation.valid) return null
      current = nextValidation.url
      continue
    }

    return response.ok ? current : null
  }

  return null
}
