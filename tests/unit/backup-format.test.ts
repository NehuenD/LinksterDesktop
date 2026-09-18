import { describe, expect, it } from 'vitest'
import {
  BACKUP_FORMAT_VERSION,
  parseBackup,
  serializeBackup,
  type BackupFile
} from '../../src/main/services/backup-format'

function makeBackup(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    manifest: {
      app: 'linkster',
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt: '2026-09-15T00:00:00.000Z',
      appVersion: '0.1.0',
      counts: { links: 1, labels: 1, contents: 0 }
    },
    labels: ['General'],
    labelColors: { General: '#10B981' },
    preferences: {
      themeMode: 'system',
      clipboardMonitoring: true,
      notifyOnLinkCapture: true,
      notifyOnScreenshot: true,
      quickCaptureEnabled: true,
      quickCaptureHotkey: 'CommandOrControl+Shift+L'
    },
    links: [
      {
        id: 'id-1',
        url: 'https://example.com',
        title: 'Title',
        description: null,
        thumbnailUrl: null,
        author: null,
        siteName: null,
        label: 'General',
        kind: 'x-post',
        isRead: false,
        isArchived: false,
        note: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: null
      }
    ],
    contents: [],
    xPosts: [
      {
        linkId: 'id-1',
        tweetId: '20',
        authorHandle: 'jack',
        authorName: 'jack',
        text: 'just setting up my twttr',
        postedAt: '2006-03-21T00:00:00.000Z',
        relatedUrl: 'https://example.com/story'
      }
    ],
    ...overrides
  }
}

describe('backup format', () => {
  it('round-trips a backup file through serialize and parse', () => {
    const file = makeBackup()
    const parsed = parseBackup(serializeBackup(file))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.file).toEqual(file)
  })

  it('round-trips X post metadata and kind for isolated-section rows', () => {
    const parsed = parseBackup(serializeBackup(makeBackup()))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.file.links[0].kind).toBe('x-post')
    expect(parsed.file.xPosts).toEqual([
      {
        linkId: 'id-1',
        tweetId: '20',
        authorHandle: 'jack',
        authorName: 'jack',
        text: 'just setting up my twttr',
        postedAt: '2006-03-21T00:00:00.000Z',
        relatedUrl: 'https://example.com/story'
      }
    ])
  })

  it('accepts pre-xPosts (v1) backup files', () => {
    const raw = JSON.parse(serializeBackup(makeBackup())) as Record<string, unknown>
    delete raw.xPosts
    const parsed = parseBackup(JSON.stringify(raw))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.file.xPosts).toEqual([])
  })

  it('rejects a backup created by a newer format version', () => {
    const parsed = parseBackup(serializeBackup(makeBackup({
      manifest: {
        app: 'linkster',
        formatVersion: BACKUP_FORMAT_VERSION + 1,
        createdAt: '2026-09-15T00:00:00.000Z',
        appVersion: '9.9.9',
        counts: { links: 0, labels: 0, contents: 0 }
      }
    })))
    expect(parsed).toEqual({ ok: false, error: expect.stringContaining('newer version') })
  })

  it('rejects JSON that is not a Linkster backup', () => {
    expect(parseBackup('{"hello":"world"}').ok).toBe(false)
    expect(parseBackup('not json').ok).toBe(false)
  })

  it('never carries credential fields even when present in the raw file', () => {
    const raw = JSON.parse(serializeBackup(makeBackup())) as Record<string, unknown>
    raw.authSession = { refreshToken: 'secret' }
    raw.preferences = { ...(raw.preferences as object), accessToken: 'secret' }

    const parsed = parseBackup(JSON.stringify(raw))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(JSON.stringify(parsed.file)).not.toContain('secret')
    expect(parsed.file).not.toHaveProperty('authSession')
    expect(parsed.file.preferences).not.toHaveProperty('accessToken')
  })
})
