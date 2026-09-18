import { describe, expect, it, vi } from 'vitest'
import { createCaptureThumbnailCache } from '../../src/main/services/x-capture-thumbnail'

describe('createCaptureThumbnailCache', () => {
  it('decodes once and reuses the entry while the file is unchanged', () => {
    const decode = vi.fn((png: Buffer, width: number) => `thumb:${width}:${png.length}`)
    const cache = createCaptureThumbnailCache(decode)

    const first = cache.get({ linkId: 'link-1', mtimeMs: 1000 }, () => Buffer.from('abc'))
    const second = cache.get({ linkId: 'link-1', mtimeMs: 1000 }, () => Buffer.from('abc'))

    expect(first).toBe('thumb:256:3')
    expect(second).toBe(first)
    expect(decode).toHaveBeenCalledTimes(1)
  })

  it('re-decodes when the capture file changes', () => {
    const decode = vi.fn((png: Buffer, width: number) => `thumb:${width}:${png.length}`)
    const cache = createCaptureThumbnailCache(decode)

    cache.get({ linkId: 'link-1', mtimeMs: 1000 }, () => Buffer.from('abc'))
    const updated = cache.get({ linkId: 'link-1', mtimeMs: 2000 }, () => Buffer.from('abcd'))

    expect(updated).toBe('thumb:256:4')
    expect(decode).toHaveBeenCalledTimes(2)
  })

  it('returns null when there is no PNG to decode', () => {
    const decode = vi.fn()
    const cache = createCaptureThumbnailCache(decode)
    expect(cache.get({ linkId: 'link-1', mtimeMs: 1000 }, () => null)).toBeNull()
    expect(decode).not.toHaveBeenCalled()
  })

  it('prunes entries that are no longer listed', () => {
    const decode = vi.fn((_png: Buffer, width: number) => `thumb:${width}`)
    const cache = createCaptureThumbnailCache(decode)

    cache.get({ linkId: 'link-1', mtimeMs: 1 }, () => Buffer.from('a'))
    cache.get({ linkId: 'link-2', mtimeMs: 1 }, () => Buffer.from('b'))
    cache.prune(new Set(['link-2']))

    cache.get({ linkId: 'link-1', mtimeMs: 1 }, () => Buffer.from('a'))
    expect(decode).toHaveBeenCalledTimes(3)
  })

  it('removes a single entry', () => {
    const decode = vi.fn((_png: Buffer, width: number) => `thumb:${width}`)
    const cache = createCaptureThumbnailCache(decode)

    cache.get({ linkId: 'link-1', mtimeMs: 1 }, () => Buffer.from('a'))
    cache.remove('link-1')
    cache.get({ linkId: 'link-1', mtimeMs: 1 }, () => Buffer.from('a'))

    expect(decode).toHaveBeenCalledTimes(2)
  })
})
