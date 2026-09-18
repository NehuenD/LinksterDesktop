import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BrowserWindow } from 'electron'
import { hardenWindow } from './window-security'

export function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const filePath = join(import.meta.dirname, '../renderer/index.html')
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  const appUrl = rendererUrl ?? pathToFileURL(filePath).toString()

  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 320,
    minHeight: 480,
    show: false,
    title: 'Linkster',
    backgroundColor: '#09090B',
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 14, y: 18 } : undefined,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.once('ready-to-show', () => {
    window.show()
  })

  hardenWindow(window, appUrl)

  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(filePath)
  }

  return window
}
