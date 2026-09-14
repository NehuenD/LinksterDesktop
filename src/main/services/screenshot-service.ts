import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { promises as fs, watch, type FSWatcher } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { BrowserWindow, Notification, clipboard, nativeImage, shell } from 'electron'
import { IPC, type Screenshot } from '@shared/contract/ipc'
import { store } from '../store/store'
import { isScreenshotName, sortNewestFirst } from './screenshot-rules'

const THUMBNAIL_WIDTH = 256
const SETTLE_MS = 800

export function detectScreenshotFolder(): string | null {
  const home = homedir()
  const candidates: string[] = []

  if (process.platform === 'win32') {
    candidates.push(join(home, 'Pictures', 'Screenshots'))
    if (process.env.OneDrive) {
      candidates.push(join(process.env.OneDrive, 'Pictures', 'Screenshots'))
    }
    candidates.push(join(home, 'OneDrive', 'Pictures', 'Screenshots'))
  } else if (process.platform === 'darwin') {
    candidates.push(join(home, 'Desktop'))
    candidates.push(join(home, 'Pictures', 'Screenshots'))
  } else {
    if (process.env.XDG_PICTURES_DIR) {
      candidates.push(join(process.env.XDG_PICTURES_DIR, 'Screenshots'))
    }
    candidates.push(join(home, 'Pictures', 'Screenshots'))
    candidates.push(join(home, 'Pictures'))
  }

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

export function getScreenshotFolder(): string | null {
  const custom = store.get('screenshotFolder')
  if (custom && existsSync(custom)) return custom
  return detectScreenshotFolder()
}

function isCustomFolder(): boolean {
  const custom = store.get('screenshotFolder')
  return Boolean(custom) && custom === getScreenshotFolder()
}

export function setScreenshotFolder(folder: string | null): string | null {
  if (folder && existsSync(folder)) {
    store.set('screenshotFolder', folder)
  } else {
    store.delete('screenshotFolder')
  }
  restartWatcher()
  return getScreenshotFolder()
}

async function thumbnailFor(filePath: string): Promise<string | null> {
  try {
    const image = nativeImage.createFromPath(filePath)
    if (image.isEmpty()) return null
    const { width } = image.getSize()
    const resized = width > THUMBNAIL_WIDTH ? image.resize({ width: THUMBNAIL_WIDTH }) : image
    return resized.toDataURL()
  } catch {
    return null
  }
}

export async function listScreenshots(): Promise<Screenshot[]> {
  const folder = getScreenshotFolder()
  if (!folder) return []

  const custom = isCustomFolder()
  let entries: string[]
  try {
    entries = await fs.readdir(folder)
  } catch {
    return []
  }

  const screenshots: Screenshot[] = []
  for (const name of entries) {
    if (!isScreenshotName(name, custom)) continue
    const filePath = join(folder, name)
    try {
      const stat = await fs.stat(filePath)
      if (!stat.isFile()) continue
      screenshots.push({
        id: createHash('sha1').update(filePath).digest('hex'),
        filePath,
        fileName: name,
        capturedAt: stat.mtime.toISOString(),
        thumbnailUrl: await thumbnailFor(filePath)
      })
    } catch {
      // Skip unreadable entries.
    }
  }

  return sortNewestFirst(screenshots)
}

function isWithinFolder(filePath: string): boolean {
  const folder = getScreenshotFolder()
  if (!folder) return false
  const root = resolve(folder.endsWith(sep) ? folder : folder + sep)
  return resolve(filePath).startsWith(root)
}

export async function revealScreenshot(filePath: string): Promise<void> {
  if (!isWithinFolder(filePath)) throw new Error('Path is outside the screenshots folder.')
  shell.showItemInFolder(filePath)
}

export async function copyScreenshotPath(filePath: string): Promise<void> {
  await clipboard.writeText(filePath)
}

export async function deleteScreenshot(filePath: string): Promise<void> {
  if (!isWithinFolder(filePath)) throw new Error('Path is outside the screenshots folder.')
  await fs.unlink(filePath)
  knownFiles.delete(basename(filePath))
  broadcastChanged()
}

let watcher: FSWatcher | null = null
let settleTimer: ReturnType<typeof setTimeout> | null = null
let knownFiles = new Set<string>()

function broadcastChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC.screenshots.changed)
  }
}

async function snapshotKnownFiles(folder: string): Promise<void> {
  try {
    knownFiles = new Set(await fs.readdir(folder))
  } catch {
    knownFiles = new Set()
  }
}

async function handleFolderChange(folder: string): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.readdir(folder)
  } catch {
    return
  }

  const current = new Set(entries)
  const custom = isCustomFolder()
  const added = entries.filter(
    (name) => !knownFiles.has(name) && isScreenshotName(name, custom)
  )
  knownFiles = current

  if (added.length === 0) return

  broadcastChanged()

  if (store.get('notifyOnScreenshot') && Notification.isSupported()) {
    new Notification({
      title: 'Screenshot detected',
      body:
        added.length === 1 ? added[0] : `${added.length} new screenshots detected`
    }).show()
  }
}

export function startScreenshotWatcher(): void {
  const folder = getScreenshotFolder()
  if (!folder || watcher) return

  void snapshotKnownFiles(folder)

  try {
    watcher = watch(folder, { persistent: false }, () => {
      if (settleTimer) clearTimeout(settleTimer)
      settleTimer = setTimeout(() => void handleFolderChange(folder), SETTLE_MS)
    })
  } catch {
    watcher = null
  }
}

export function stopScreenshotWatcher(): void {
  watcher?.close()
  watcher = null
  if (settleTimer) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
}

function restartWatcher(): void {
  stopScreenshotWatcher()
  startScreenshotWatcher()
}
