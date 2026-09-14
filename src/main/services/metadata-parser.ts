import { parse, type HTMLElement } from 'node-html-parser'

export interface LinkMetadata {
  title: string | null
  description: string | null
  thumbnailUrl: string | null
  author: string | null
  siteName: string | null
  ogType: string | null
}

export function emptyMetadata(): LinkMetadata {
  return {
    title: null,
    description: null,
    thumbnailUrl: null,
    author: null,
    siteName: null,
    ogType: null
  }
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

  const meta = collectMeta(root)

  const siteName = clean(firstMeta(meta, ['og:site_name']))
  const ogType = clean(firstMeta(meta, ['og:type']))
  const author = clean(firstMeta(meta, ['og:author', 'article:author', 'author']))

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

  return { title, description, thumbnailUrl, author, siteName, ogType }
}
