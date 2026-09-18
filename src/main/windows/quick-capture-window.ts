import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BrowserWindow, clipboard, screen } from 'electron'
import { DEFAULT_LABEL, IPC, type QuickCaptureContext } from '@shared/contract/ipc'
import { validateUrl } from '../services/url-validator'
import { hardenWindow } from './window-security'

const OVERLAY_WIDTH = 440
const OVERLAY_HEIGHT = 264
const CURSOR_GAP = 12
const SHOW_SETTLE_MS = 200

let overlay: BrowserWindow | null = null
let suppressBlurHide = false
let overlayDirty = false

/** Clipboard-derived context pushed to the overlay on every show. */
export async function buildQuickCaptureContext(): Promise<QuickCaptureContext> {
  let text = ''
  try {
    text = await clipboard.readText()
  } catch {
    // Transient clipboard access failures fall back to an empty context.
  }
  const validation = validateUrl(text)
  return {
    clipboardUrl: validation.valid ? validation.url : null,
    defaultLabel: DEFAULT_LABEL
  }
}

export function getQuickCaptureContext(): Promise<QuickCaptureContext> {
  return buildQuickCaptureContext()
}

function rendererEntry(): string {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) return `${devUrl}/quick-capture.html`
  return join(import.meta.dirname, '../renderer/quick-capture.html')
}

function rendererEntryUrl(): string {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) return rendererEntry()
  return pathToFileURL(rendererEntry()).toString()
}

function positionOverlay(window: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint()
  const { workArea } = screen.getDisplayNearestPoint(cursor)
  const [width, height] = window.getSize()

  const maxX = workArea.x + workArea.width - width - 8
  const maxY = workArea.y + workArea.height - height - 8
  const x = Math.min(Math.max(Math.round(cursor.x - width / 2), workArea.x + 8), maxX)
  const y = Math.min(Math.max(Math.round(cursor.y + CURSOR_GAP), workArea.y + 8), maxY)

  window.setPosition(x, y)
}

function createOverlay(): BrowserWindow {
  const window = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#08080a',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.setAlwaysOnTop(true, 'screen-saver')
  if (process.platform === 'darwin') {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  hardenWindow(window, rendererEntryUrl())

  window.on('blur', () => {
    if (
      window.isDestroyed() ||
      suppressBlurHide ||
      overlayDirty ||
      window.webContents.isDevToolsOpened()
    ) {
      return
    }
    hideQuickCaptureOverlay()
  })

  window.on('closed', () => {
    overlay = null
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void window.loadURL(rendererEntry())
  } else {
    void window.loadFile(rendererEntry())
  }

  return window
}

/** Creates the overlay hidden so the first show is fast (AC1). */
export function prewarmQuickCaptureOverlay(): BrowserWindow {
  if (overlay && !overlay.isDestroyed()) return overlay
  overlay = createOverlay()
  return overlay
}

function sendContext(window: BrowserWindow): void {
  void buildQuickCaptureContext().then((context) => {
    if (window.isDestroyed()) return
    const deliver = (): void => {
      if (!window.isDestroyed()) window.webContents.send(IPC.quickCapture.context, context)
    }
    if (window.webContents.isLoading()) {
      window.webContents.once('did-finish-load', deliver)
    } else {
      deliver()
    }
  })
}

export function showQuickCaptureOverlay(): void {
  const window = prewarmQuickCaptureOverlay()
  if (window.isDestroyed()) return

  overlayDirty = false
  suppressBlurHide = true
  positionOverlay(window)
  sendContext(window)
  window.show()
  window.focus()

  setTimeout(() => {
    suppressBlurHide = false
  }, SHOW_SETTLE_MS)
}

export function hideQuickCaptureOverlay(): void {
  if (!overlay || overlay.isDestroyed()) return
  overlayDirty = false
  overlay.hide()
}

export function toggleQuickCaptureOverlay(): void {
  if (overlay?.isVisible()) hideQuickCaptureOverlay()
  else showQuickCaptureOverlay()
}

export function isQuickCaptureOverlayVisible(): boolean {
  return overlay?.isVisible() ?? false
}

/** Renderer reports whether the input has unsaved edits; a dirty overlay resists blur-hide. */
export function setQuickCaptureDirty(dirty: boolean): void {
  overlayDirty = dirty
}

export function destroyQuickCaptureOverlay(): void {
  if (overlay && !overlay.isDestroyed()) overlay.destroy()
  overlay = null
  overlayDirty = false
}
