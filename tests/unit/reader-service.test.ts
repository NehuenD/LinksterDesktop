import { describe, expect, it } from 'vitest'
import type { Link } from '@shared/contract/ipc'
import { createMemoryContentCache } from '../../src/main/data/content-cache'
import type { LinkContentRow } from '../../src/main/data/link-repository'
import { createReaderService } from '../../src/main/services/reader-service'

function link(overrides: Partial<Link> = {}): Link {
  return {
    id: 'id-1',
    url: 'https://example.com/post',
    title: 'Example',
    description: 'Desc',
    thumbnailUrl: 'https://example.com/cover.png',
    author: 'Channel',
    siteName: 'Example',
    label: 'General',
    kind: 'link',
    isRead: false,
    isArchived: false,
    note: null,
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: null,
    userId: 'u1',
    wordCount: null,
    readingTimeMinutes: null,
    extractionStatus: 'none',
    ...overrides
  }
}

const row: LinkContentRow = {
  content_html: '<p>Hello world</p>',
  content_text: 'Hello world',
  word_count: 450,
  extraction_status: 'ok',
  extracted_at: '2026-09-15T11:00:00.000Z'
}

describe('readerService.getLinkContent', () => {
  it('fetches content, derives reading time, and populates the cache', async () => {
    const cache = createMemoryContentCache()
    const service = createReaderService({
      getLink: async () => link(),
      getContentRow: async () => row,
      cache
    })

    const content = await service.getLinkContent('id-1')

    expect(content?.fromCache).toBe(false)
    expect(content?.contentHtml).toBe('<p>Hello world</p>')
    expect(content?.readingTimeMinutes).toBe(2)
    expect(cache.read('id-1')?.contentText).toBe('Hello world')
  })

  it('serves cached content when the network is unavailable', async () => {
    const cache = createMemoryContentCache()
    const online = createReaderService({
      getLink: async () => link(),
      getContentRow: async () => row,
      cache
    })
    await online.getLinkContent('id-1')

    const offline = createReaderService({
      getLink: async () => link(),
      getContentRow: async () => {
        throw new Error('offline')
      },
      cache
    })
    const content = await offline.getLinkContent('id-1')

    expect(content?.fromCache).toBe(true)
    expect(content?.contentHtml).toBe('<p>Hello world</p>')
  })

  it('serves the cached article even when the link lookup itself fails (offline)', async () => {
    const cache = createMemoryContentCache()
    const online = createReaderService({
      getLink: async () => link(),
      getContentRow: async () => row,
      cache
    })
    await online.getLinkContent('id-1')

    const offline = createReaderService({
      getLink: async () => {
        throw new Error('offline')
      },
      getContentRow: async () => {
        throw new Error('offline')
      },
      cache
    })
    const content = await offline.getLinkContent('id-1')

    expect(content?.fromCache).toBe(true)
    expect(content?.title).toBe('Example')
    expect(content?.contentHtml).toBe('<p>Hello world</p>')
  })

  it('drops the cached body when the link no longer exists', async () => {
    const cache = createMemoryContentCache()
    const service = createReaderService({
      getLink: async () => null,
      getContentRow: async () => row,
      cache
    })
    cache.write({
      linkId: 'gone',
      contentHtml: '<p>stale</p>',
      contentText: 'stale',
      wordCount: 1,
      extractionStatus: 'ok',
      extractedAt: null
    })

    expect(await service.getLinkContent('gone')).toBeNull()
    expect(cache.read('gone')).toBeNull()
  })

  it('removes cached content on request (delete path)', async () => {
    const cache = createMemoryContentCache()
    const service = createReaderService({
      getLink: async () => link(),
      getContentRow: async () => row,
      cache
    })
    await service.getLinkContent('id-1')
    expect(cache.read('id-1')).not.toBeNull()

    service.removeContent('id-1')
    expect(cache.read('id-1')).toBeNull()
  })

  it('returns metadata-only reader content when there is no stored body', async () => {
    const service = createReaderService({
      getLink: async () => link({ extractionStatus: 'media' }),
      getContentRow: async () => null,
      cache: createMemoryContentCache()
    })

    const content = await service.getLinkContent('id-1')

    expect(content?.contentHtml).toBeNull()
    expect(content?.extractionStatus).toBe('media')
    expect(content?.author).toBe('Channel')
    expect(content?.fromCache).toBe(false)
  })

  it('returns null for an unknown link', async () => {
    const service = createReaderService({
      getLink: async () => null,
      getContentRow: async () => null,
      cache: createMemoryContentCache()
    })
    expect(await service.getLinkContent('missing')).toBeNull()
  })
})
