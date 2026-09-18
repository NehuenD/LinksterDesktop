import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExtractionStatus, Link } from '@shared/contract/ipc'

export interface CachedContent {
  linkId: string
  contentHtml: string | null
  contentText: string | null
  wordCount: number | null
  extractionStatus: ExtractionStatus
  extractedAt: string | null
  /**
   * Link snapshot captured with the body so an offline read can render the
   * reader (title/url/note/...) without reaching Supabase.
   */
  link?: Link | null
}

export interface ContentCacheAdapter {
  read(linkId: string): CachedContent | null
  write(entry: CachedContent): void
  remove(linkId: string): void
  prune(maxEntries: number): void
}

export function createMemoryContentCache(): ContentCacheAdapter {
  const entries = new Map<string, CachedContent>()
  return {
    read: (linkId) => entries.get(linkId) ?? null,
    write: (entry) => {
      entries.set(entry.linkId, entry)
    },
    remove: (linkId) => {
      entries.delete(linkId)
    },
    prune: () => undefined
  }
}

const FILE_EXTENSION = '.json'

function isSafeId(linkId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(linkId)
}

/**
 * File-backed cache so the reader works offline once an article has been
 * extracted. Entries are JSON documents keyed by link id; `prune` keeps the
 * directory bounded by evicting the least-recently-modified files.
 */
export function createFileContentCache(directory: string): ContentCacheAdapter {
  const pathFor = (linkId: string): string => join(directory, `${linkId}${FILE_EXTENSION}`)

  const ensureDirectory = (): void => {
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
  }

  return {
    read: (linkId) => {
      if (!isSafeId(linkId)) return null
      try {
        const raw = readFileSync(pathFor(linkId), 'utf8')
        const parsed = JSON.parse(raw) as CachedContent
        return parsed && parsed.linkId === linkId ? parsed : null
      } catch {
        return null
      }
    },
    write: (entry) => {
      if (!isSafeId(entry.linkId)) return
      try {
        ensureDirectory()
        writeFileSync(pathFor(entry.linkId), JSON.stringify(entry), 'utf8')
      } catch {
        // Cache writes are best-effort.
      }
    },
    remove: (linkId) => {
      if (!isSafeId(linkId)) return
      try {
        rmSync(pathFor(linkId), { force: true })
      } catch {
        // Ignore.
      }
    },
    prune: (maxEntries) => {
      try {
        if (!existsSync(directory)) return
        const files = readdirSync(directory).filter((name) => name.endsWith(FILE_EXTENSION))
        if (files.length <= maxEntries) return
        const byAge: Array<{ fullPath: string; mtime: number }> = []
        for (const name of files) {
          const fullPath = join(directory, name)
          try {
            byAge.push({ fullPath, mtime: statSync(fullPath).mtimeMs })
          } catch {
            // A file that vanished mid-scan must not abort pruning.
          }
        }
        byAge.sort((a, b) => a.mtime - b.mtime)
        for (const file of byAge.slice(0, Math.max(0, byAge.length - maxEntries))) {
          try {
            rmSync(file.fullPath, { force: true })
          } catch {
            // Ignore individual failures.
          }
        }
      } catch {
        // Ignore.
      }
    }
  }
}
