import { NodeType, type HTMLElement, type Node } from 'node-html-parser'
import type { ExtractionStatus } from '@shared/contract/ipc'
import type { LinkMetadata } from './metadata-parser'

export type PageKind = 'article' | 'media' | 'other'
export type { ExtractionStatus }

export interface ExtractedContent {
  contentHtml: string | null
  contentText: string | null
  wordCount: number
  status: ExtractionStatus
}

export const MIN_ARTICLE_WORDS = 140
export const MAX_CONTENT_TEXT = 200_000
export const MAX_CONTENT_HTML = 400_000

const MEDIA_HOSTS = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'tiktok.com',
  'twitch.tv',
  'dailymotion.com',
  'soundcloud.com',
  'spotify.com',
  'open.spotify.com',
  'music.apple.com',
  'podcasts.apple.com'
]

const MEDIA_OG_TYPES = /^(video|music)(\.|$)/
const NON_ARTICLE_OG_TYPES = new Set(['product', 'profile', 'book'])

const NOISE_SELECTOR = [
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'textarea',
  'select',
  'button',
  'svg',
  'canvas',
  'nav',
  'header',
  'footer',
  'aside',
  '[role="navigation"]',
  '[aria-hidden="true"]',
  '.ad',
  '.ads',
  '.advert',
  '.advertisement',
  '.sidebar',
  '.comment',
  '.comments',
  '.share',
  '.social',
  '.newsletter',
  '.related'
].join(', ')

const CANDIDATE_SELECTOR = [
  'article',
  'main',
  '[role="main"]',
  '.post',
  '.article',
  '.entry-content',
  '.post-content',
  '.content',
  '#content'
].join(', ')

const ALLOWED_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'em',
  'strong',
  'b',
  'i',
  'a',
  'img',
  'figure',
  'figcaption',
  'hr',
  'br',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'sup',
  'sub'
])

const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan'])
const VOID_TAGS = new Set(['img', 'br', 'hr'])

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function countWords(value: string): number {
  const matches = value.match(/\S+/g)
  return matches ? matches.length : 0
}

export function classifyPage(metadata: LinkMetadata, url: string): PageKind {
  const ogType = (metadata.ogType ?? '').toLowerCase()
  if (MEDIA_OG_TYPES.test(ogType)) return 'media'

  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    host = ''
  }
  if (host && MEDIA_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return 'media'
  }

  if (NON_ARTICLE_OG_TYPES.has(ogType)) return 'other'
  return 'article'
}

function stripNoise(root: HTMLElement): void {
  for (const element of root.querySelectorAll(NOISE_SELECTOR)) {
    element.remove()
  }
}

function scoreElement(element: HTMLElement): number {
  let score = 0
  for (const paragraph of element.querySelectorAll('p')) {
    const words = countWords(collapse(paragraph.text))
    if (words >= 10) score += words
  }
  return score
}

function pickCandidate(root: HTMLElement): HTMLElement | null {
  let best: HTMLElement | null = null
  let bestScore = 0

  for (const element of root.querySelectorAll(CANDIDATE_SELECTOR)) {
    const score = scoreElement(element)
    if (score > bestScore) {
      bestScore = score
      best = element
    }
  }

  if (best && bestScore >= MIN_ARTICLE_WORDS) return best

  // Fall back to the whole body when no narrow candidate is dense enough.
  const body = root.querySelector('body')
  if (body && scoreElement(body) >= MIN_ARTICLE_WORDS) return body
  return null
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function safeUrl(value: string, baseUrl: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return null
  }
  try {
    const resolved = new URL(trimmed, baseUrl)
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null
    return resolved.toString()
  } catch {
    return null
  }
}

interface BuildAttrsResult {
  html: string
  drop: boolean
}

function buildAttrs(element: HTMLElement, tag: string, baseUrl: string): BuildAttrsResult {
  const attrs: string[] = []
  const raw = element.attributes ?? {}
  let width: number | null = null
  let height: number | null = null

  for (const name of Object.keys(raw)) {
    const key = name.toLowerCase()
    if (!ALLOWED_ATTRS.has(key)) continue
    const value = raw[name]

    if (key === 'href' || key === 'src') {
      const resolved = safeUrl(value, baseUrl)
      if (resolved) attrs.push(`${key}="${escapeAttr(resolved)}"`)
      continue
    }

    if (key === 'width' || key === 'height') {
      const num = Number.parseInt(value, 10)
      if (!Number.isFinite(num) || num <= 0) continue
      if (key === 'width') width = num
      else height = num
      attrs.push(`${key}="${num}"`)
      continue
    }

    attrs.push(`${key}="${escapeAttr(value)}"`)
  }

  if (tag === 'img') {
    const smallWidth = width !== null && width <= 2
    const smallHeight = height !== null && height <= 2
    const trackingPixel = (smallWidth && (height === null || height <= 2)) || (smallHeight && width === null)
    if (trackingPixel) return { html: '', drop: true }
  }

  return { html: attrs.length > 0 ? ` ${attrs.join(' ')}` : '', drop: false }
}

function serialize(node: Node, baseUrl: string, out: string[]): void {
  if (node.nodeType === NodeType.TEXT_NODE) {
    out.push(escapeText(node.text))
    return
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return

  const element = node as HTMLElement
  const tag = (element.tagName ?? element.rawTagName ?? '').toLowerCase()
  const children = element.childNodes ?? []

  if (!ALLOWED_TAGS.has(tag)) {
    for (const child of children) serialize(child, baseUrl, out)
    return
  }

  const built = buildAttrs(element, tag, baseUrl)
  if (built.drop) return

  if (VOID_TAGS.has(tag)) {
    out.push(`<${tag}${built.html} />`)
    return
  }

  out.push(`<${tag}${built.html}>`)
  for (const child of children) serialize(child, baseUrl, out)
  out.push(`</${tag}>`)
}

/**
 * Pure readability-style extractor. Classifies the page first so media links
 * are never run through the article pipeline, then picks the densest content
 * candidate and serializes it through a strict allowlist.
 */
export function extractContent(
  root: HTMLElement,
  baseUrl: string,
  metadata: LinkMetadata
): ExtractedContent {
  const kind = classifyPage(metadata, baseUrl)
  if (kind === 'media') {
    return { contentHtml: null, contentText: null, wordCount: 0, status: 'media' }
  }
  if (kind === 'other') {
    return { contentHtml: null, contentText: null, wordCount: 0, status: 'unsupported' }
  }

  const work = root.clone() as HTMLElement
  stripNoise(work)

  const candidate = pickCandidate(work)
  if (!candidate) {
    return { contentHtml: null, contentText: null, wordCount: 0, status: 'empty' }
  }

  const contentText = collapse(candidate.text)
  const wordCount = countWords(contentText)
  if (wordCount < MIN_ARTICLE_WORDS) {
    return { contentHtml: null, contentText: null, wordCount, status: 'empty' }
  }

  const parts: string[] = []
  for (const child of candidate.childNodes) serialize(child, baseUrl, parts)

  return {
    contentHtml: parts.join('').slice(0, MAX_CONTENT_HTML),
    contentText: contentText.slice(0, MAX_CONTENT_TEXT),
    wordCount,
    status: 'ok'
  }
}
