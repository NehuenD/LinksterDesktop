import { z } from 'zod'
import {
  ExtractionStatusSchema,
  LinkKindSchema,
  ThemeModeSchema,
  type BackupManifest,
  type BackupPreferences,
  type Link,
  type LinkKind
} from '@shared/contract/ipc'

export const BACKUP_FORMAT_VERSION = 2

/** Filename prefix shared by the writer and the retention pruner. */
export const BACKUP_FILE_PREFIX = 'linkster-backup-'

export interface BackupLink {
  id: string
  url: string
  title: string | null
  description: string | null
  thumbnailUrl: string | null
  author: string | null
  siteName: string | null
  label: string
  /** Informational; restore re-classifies from the URL. Optional for v1 files. */
  kind?: LinkKind
  isRead: boolean
  isArchived: boolean
  note: string | null
  createdAt: string
  updatedAt: string | null
  /** YouTube enrichment; optional so v1 backups stay valid. */
  durationSeconds?: number | null
  channelUrl?: string | null
}

export interface BackupContent {
  linkId: string
  contentHtml: string | null
  contentText: string | null
  wordCount: number | null
  extractionStatus: z.infer<typeof ExtractionStatusSchema>
  extractedAt: string | null
}

/**
 * Tweet metadata for a backed-up X post. Capture PNGs are local-only files and
 * are deliberately not archived; restore resets the capture state to `none` so
 * the post can be captured again on the restoring device.
 */
export interface BackupXPost {
  linkId: string
  tweetId: string
  authorHandle: string | null
  authorName: string | null
  text: string | null
  postedAt: string | null
  relatedUrl: string | null
}

export interface BackupFile {
  manifest: BackupManifest
  labels: string[]
  labelColors: Record<string, string>
  preferences: BackupPreferences
  links: BackupLink[]
  contents: BackupContent[]
  xPosts?: BackupXPost[]
}

const BackupLinkSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  author: z.string().nullable(),
  siteName: z.string().nullable(),
  label: z.string(),
  kind: LinkKindSchema.optional(),
  isRead: z.boolean(),
  isArchived: z.boolean(),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
  durationSeconds: z.number().nullable().optional(),
  channelUrl: z.string().nullable().optional()
})

const BackupContentSchema = z.object({
  linkId: z.string(),
  contentHtml: z.string().nullable(),
  contentText: z.string().nullable(),
  wordCount: z.number().nullable(),
  extractionStatus: ExtractionStatusSchema,
  extractedAt: z.string().nullable()
})

const BackupXPostSchema = z.object({
  linkId: z.string(),
  tweetId: z.string(),
  authorHandle: z.string().nullable(),
  authorName: z.string().nullable(),
  text: z.string().nullable(),
  postedAt: z.string().nullable(),
  relatedUrl: z.string().nullable()
})

const BackupManifestSchema = z.object({
  app: z.literal('linkster'),
  formatVersion: z.number().int().positive(),
  createdAt: z.string(),
  appVersion: z.string(),
  counts: z.object({
    links: z.number().int().nonnegative(),
    labels: z.number().int().nonnegative(),
    contents: z.number().int().nonnegative()
  })
})

const BackupPreferencesSchema = z.object({
  themeMode: ThemeModeSchema,
  clipboardMonitoring: z.boolean(),
  notifyOnLinkCapture: z.boolean(),
  notifyOnScreenshot: z.boolean(),
  quickCaptureEnabled: z.boolean(),
  quickCaptureHotkey: z.string()
})

export const BackupFileSchema = z.object({
  manifest: BackupManifestSchema,
  labels: z.array(z.string()),
  labelColors: z.record(z.string(), z.string()),
  preferences: BackupPreferencesSchema,
  links: z.array(BackupLinkSchema),
  contents: z.array(BackupContentSchema),
  xPosts: z.array(BackupXPostSchema).optional().default([])
})

export function toBackupLink(link: Link): BackupLink {
  return {
    id: link.id,
    url: link.url,
    title: link.title,
    description: link.description,
    thumbnailUrl: link.thumbnailUrl,
    author: link.author,
    siteName: link.siteName,
    label: link.label,
    kind: link.kind,
    isRead: link.isRead,
    isArchived: link.isArchived,
    note: link.note,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    durationSeconds: link.durationSeconds ?? null,
    channelUrl: link.channelUrl ?? null
  }
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 2)
}

export type ParseBackupResult =
  | { ok: true; file: BackupFile }
  | { ok: false; error: string }

export function parseBackup(raw: string): ParseBackupResult {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' }
  }

  const parsed = BackupFileSchema.safeParse(json)
  if (!parsed.success) {
    return { ok: false, error: 'This is not a valid Linkster backup file.' }
  }
  if (parsed.data.manifest.formatVersion > BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error: 'This backup was created by a newer version of Linkster. Update the app and try again.'
    }
  }

  return { ok: true, file: parsed.data }
}
