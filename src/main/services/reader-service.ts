import {
  ExtractionStatusSchema,
  type ExtractionStatus,
  type Link,
  type ReaderContent
} from '@shared/contract/ipc'
import { readingTimeMinutes } from '@shared/lib/format'
import type { CachedContent, ContentCacheAdapter } from '../data/content-cache'
import type { LinkContentRow } from '../data/link-repository'

const MAX_CACHED_ARTICLES = 500

export interface ReaderDeps {
  getLink: (id: string) => Promise<Link | null>
  getContentRow: (id: string) => Promise<LinkContentRow | null>
  cache: ContentCacheAdapter
}

export interface ReaderService {
  getLinkContent(linkId: string): Promise<ReaderContent | null>
  cacheContent(linkId: string, content: CachedContent, link?: Link | null): void
  removeContent(linkId: string): void
  maxCachedArticles: number
}

export function parseExtractionStatus(value: string | null | undefined): ExtractionStatus {
  const parsed = ExtractionStatusSchema.safeParse(value)
  return parsed.success ? parsed.data : 'none'
}

function toCached(linkId: string, row: LinkContentRow): CachedContent {
  return {
    linkId,
    contentHtml: row.content_html,
    contentText: row.content_text,
    wordCount: row.word_count,
    extractionStatus: parseExtractionStatus(row.extraction_status),
    extractedAt: row.extracted_at
  }
}

export function createReaderService(deps: ReaderDeps): ReaderService {
  function toReaderContent(
    link: Link,
    content: Partial<CachedContent>,
    fromCache: boolean
  ): ReaderContent {
    const wordCount = content.wordCount ?? link.wordCount
    return {
      linkId: link.id,
      url: link.url,
      title: link.title,
      description: link.description,
      thumbnailUrl: link.thumbnailUrl,
      siteName: link.siteName,
      author: link.author,
      note: link.note,
      contentHtml: content.contentHtml ?? null,
      contentText: content.contentText ?? null,
      wordCount,
      readingTimeMinutes: readingTimeMinutes(wordCount),
      extractionStatus: content.extractionStatus ?? link.extractionStatus,
      extractedAt: content.extractedAt ?? null,
      fromCache
    }
  }

  async function getLinkContent(linkId: string): Promise<ReaderContent | null> {
    // Offline-first: a cached copy is served even when the link lookup fails,
    // so a previously extracted article stays readable without a network.
    const cached = deps.cache.read(linkId)

    let link: Link | null
    try {
      link = await deps.getLink(linkId)
    } catch (error) {
      if (cached?.link) return toReaderContent(cached.link, cached, true)
      throw error
    }

    if (!link) {
      // The row is gone (deleted or another account): drop the stale body.
      deps.cache.remove(linkId)
      return null
    }

    if (cached) return toReaderContent(link, cached, true)

    const row = await deps.getContentRow(linkId)
    if (!row) return toReaderContent(link, {}, false)

    const entry = toCached(linkId, row)
    deps.cache.write({ ...entry, link })
    deps.cache.prune(MAX_CACHED_ARTICLES)
    return toReaderContent(link, entry, false)
  }

  function cacheContent(linkId: string, content: CachedContent, link?: Link | null): void {
    deps.cache.write({ ...content, linkId, link: link ?? content.link ?? null })
    deps.cache.prune(MAX_CACHED_ARTICLES)
  }

  function removeContent(linkId: string): void {
    deps.cache.remove(linkId)
  }

  return { getLinkContent, cacheContent, removeContent, maxCachedArticles: MAX_CACHED_ARTICLES }
}
