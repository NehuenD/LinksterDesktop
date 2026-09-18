import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'

const SAFE_LINK_ID = /^[A-Za-z0-9_-]+$/

export interface XCaptureFileStat {
  size: number
  mtimeMs: number
}

export interface XCaptureFiles {
  dir: string
  pathFor(linkId: string): string
  exists(linkId: string): boolean
  stat(linkId: string): XCaptureFileStat | null
  read(linkId: string): Buffer | null
  write(linkId: string, png: Buffer): void
  remove(linkId: string): void
  removeMany(linkIds: readonly string[]): void
}

/**
 * File access for local capture PNGs. Link ids are validated against a strict
 * pattern so a crafted id can never escape the capture directory.
 */
export function createXCaptureFiles(directory: string): XCaptureFiles {
  const pathFor = (linkId: string): string => {
    if (!SAFE_LINK_ID.test(linkId)) {
      throw new Error('Invalid link id for a capture path.')
    }
    return join(directory, `${linkId}.png`)
  }

  const ensureDirectory = (): void => {
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
  }

  const removeFile = (linkId: string): void => {
    const target = pathFor(linkId)
    try {
      rmSync(target, { force: true })
    } catch {
      // Removal is best-effort.
    }
  }

  return {
    dir: directory,
    pathFor,

    exists: (linkId) => existsSync(pathFor(linkId)),

    stat: (linkId) => {
      const target = pathFor(linkId)
      try {
        const stats = statSync(target)
        return stats.isFile() ? { size: stats.size, mtimeMs: stats.mtimeMs } : null
      } catch {
        return null
      }
    },

    read: (linkId) => {
      const target = pathFor(linkId)
      try {
        return readFileSync(target)
      } catch {
        return null
      }
    },

    write: (linkId, png) => {
      ensureDirectory()
      const target = pathFor(linkId)
      const temp = `${target}.tmp`
      writeFileSync(temp, png)
      renameSync(temp, target)
    },

    remove: removeFile,

    removeMany: (linkIds) => {
      for (const linkId of linkIds) removeFile(linkId)
    }
  }
}
