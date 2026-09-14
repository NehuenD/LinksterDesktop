import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { app } from 'electron'
import type { ClipboardWatcher } from './watcher'

interface NativeListener {
  start(callback: (text: string) => void): void
  stop(): void
}

const ADDON_FILE = 'linkster_clipboard_listener.node'

function addonCandidates(): string[] {
  const appPath = app.getAppPath()
  const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked')
  const resources = process.resourcesPath ?? '.'

  return [
    join(appPath, 'native', 'clipboard-listener', 'build', 'Release', ADDON_FILE),
    join(unpackedPath, 'native', 'clipboard-listener', 'build', 'Release', ADDON_FILE),
    join(resources, 'native', 'clipboard-listener', 'build', 'Release', ADDON_FILE),
    join(resources, 'native', ADDON_FILE)
  ]
}

function loadListener(): NativeListener | null {
  const require = createRequire(import.meta.url)
  for (const candidate of addonCandidates()) {
    if (existsSync(candidate)) {
      return require(candidate) as NativeListener
    }
  }
  return null
}

/**
 * Returns an event-driven watcher backed by the native addon, or null when the
 * platform/addon is unavailable so callers can fall back to polling.
 */
export function createNativeWatcher(
  onChange: (text: string) => void
): ClipboardWatcher | null {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return null

  let listener: NativeListener
  try {
    const loaded = loadListener()
    if (!loaded) return null
    listener = loaded
  } catch {
    return null
  }

  let running = false

  return {
    start() {
      if (running) return
      listener.start((text) => onChange(text))
      running = true
    },
    stop() {
      if (!running) return
      listener.stop()
      running = false
    },
    isRunning() {
      return running
    }
  }
}
