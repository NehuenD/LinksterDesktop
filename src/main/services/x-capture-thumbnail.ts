export const CAPTURE_THUMBNAIL_WIDTH = 256

export interface ThumbnailSource {
  linkId: string
  mtimeMs: number
}

export interface CaptureThumbnailCache {
  get(source: ThumbnailSource, load: () => Buffer | null): string | null
  remove(linkId: string): void
  prune(activeIds: ReadonlySet<string>): void
}

export type CaptureDecoder = (png: Buffer, width: number) => string | null

/**
 * Mtime-keyed thumbnail cache for local captures. Decoding is injected so the
 * Electron `nativeImage` dependency stays in the instance layer.
 */
export function createCaptureThumbnailCache(decode: CaptureDecoder): CaptureThumbnailCache {
  const cache = new Map<string, { mtimeMs: number; dataUrl: string | null }>()

  return {
    get({ linkId, mtimeMs }, load) {
      const cached = cache.get(linkId)
      if (cached && cached.mtimeMs === mtimeMs) return cached.dataUrl

      const png = load()
      const dataUrl = png ? decode(png, CAPTURE_THUMBNAIL_WIDTH) : null
      cache.set(linkId, { mtimeMs, dataUrl })
      return dataUrl
    },

    remove(linkId) {
      cache.delete(linkId)
    },

    prune(activeIds) {
      for (const linkId of cache.keys()) {
        if (!activeIds.has(linkId)) cache.delete(linkId)
      }
    }
  }
}
