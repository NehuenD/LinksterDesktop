import { extname } from 'node:path'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

export function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(name).toLowerCase())
}

/**
 * A file counts as a screenshot when it is an image and its name matches the
 * usual OS patterns. When the folder is a manual override we accept every
 * image so users can point at any gallery.
 */
export function isScreenshotName(name: string, includeAllImages: boolean): boolean {
  if (!isImageFile(name)) return false
  if (includeAllImages) return true

  const lower = name.toLowerCase()
  return (
    lower.includes('screenshot') ||
    lower.includes('screen shot') ||
    lower.includes('screencapture')
  )
}

export function sortNewestFirst<T extends { capturedAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
}
