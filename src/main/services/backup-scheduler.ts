import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUP_FILE_PREFIX } from './backup-format'
import { createBackup, defaultBackupDirectory } from './backup-service'
import { getBackupSettings } from './settings-service'

const BACKUP_FILE_RE = new RegExp(`^${BACKUP_FILE_PREFIX}.*\\.json$`, 'i')

const CHECK_INTERVAL_MS = 60 * 60 * 1000
const STARTUP_DELAY_MS = 15_000

let interval: ReturnType<typeof setInterval> | null = null
let startup: ReturnType<typeof setTimeout> | null = null

function isDue(lastBackupAt: string | null, intervalDays: number, now: number): boolean {
  if (!lastBackupAt) return true
  const last = Date.parse(lastBackupAt)
  if (Number.isNaN(last)) return true
  return now - last >= intervalDays * 24 * 60 * 60 * 1000
}

export async function pruneBackups(folder: string, retention: number): Promise<void> {
  try {
    const entries = (await readdir(folder)).filter((name) => BACKUP_FILE_RE.test(name))
    if (entries.length <= retention) return

    const timed = await Promise.all(
      entries.map(async (name) => {
        const full = join(folder, name)
        try {
          return { full, mtime: (await stat(full)).mtimeMs }
        } catch {
          return null
        }
      })
    )

    const sorted = timed
      .filter((entry): entry is { full: string; mtime: number } => entry !== null)
      .sort((a, b) => a.mtime - b.mtime)

    for (const file of sorted.slice(0, sorted.length - retention)) {
      try {
        await rm(file.full, { force: true })
      } catch {
        // A locked file must not abort pruning of the rest.
      }
    }
  } catch {
    // Retention pruning is best-effort.
  }
}

// Prevents a slow backup from overlapping the next interval tick (and racing
// retention/folder writes).
let running = false

async function tick(): Promise<void> {
  if (running) return
  running = true
  try {
    const settings = getBackupSettings()
    if (!settings.enabled) return
    if (!isDue(settings.lastBackupAt, settings.intervalDays, Date.now())) return

    const folder = settings.folder ?? defaultBackupDirectory()
    try {
      await createBackup({ targetDir: folder })
      await pruneBackups(folder, settings.retention)
    } catch (error) {
      // Auto-backup must never disturb the app, but a silent failure means the
      // user believes they are protected when they are not.
      console.warn(
        '[backup] scheduled backup failed:',
        error instanceof Error ? error.message : error
      )
    }
  } finally {
    running = false
  }
}

export function startBackupScheduler(): void {
  if (interval) return
  interval = setInterval(() => void tick(), CHECK_INTERVAL_MS)
  startup = setTimeout(() => void tick(), STARTUP_DELAY_MS)
}

export function stopBackupScheduler(): void {
  if (interval) {
    clearInterval(interval)
    interval = null
  }
  if (startup) {
    clearTimeout(startup)
    startup = null
  }
}
