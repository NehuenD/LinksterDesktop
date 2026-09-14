import { resolve } from 'node:path'
import { BrowserWindow, app } from 'electron'
import {
  completeSignInFromDeepLink,
  refreshAuthState,
  subscribeToAuthChanges
} from './auth/auth-service'
import { PROTOCOL, findDeepLink } from './auth/deep-link'
import { registerIpcHandlers } from './ipc'
import { applyStoredMonitoringPreference } from './services/clipboard-controller'
import { startScreenshotWatcher } from './services/screenshot-service'
import { applyThemeMode, getThemeMode } from './services/theme-service'
import { createTray, hasTray } from './services/tray-service'
import { initializeAutoUpdate } from './services/update-service'
import { createMainWindow } from './windows/main-window'

const userDataDir = process.env['LINKSTER_USER_DATA_DIR']
if (userDataDir) {
  app.setPath('userData', userDataDir)
}

let mainWindow: BrowserWindow | null = null
let isQuitting = false

function showMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function attachWindowBehavior(window: BrowserWindow): void {
  window.on('close', (event) => {
    if (isQuitting || userDataDir) return
    event.preventDefault()
    window.hide()
  })

  if (hasTray() && process.platform !== 'darwin') {
    window.setSkipTaskbar(true)
  }
}

function createWindow(): BrowserWindow {
  const window = createMainWindow()
  attachWindowBehavior(window)
  return window
}

function registerProtocolClient(): void {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1])])
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL)
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  registerProtocolClient()

  app.on('second-instance', (_event, argv) => {
    showMainWindow()
    const deepLink = findDeepLink(argv)
    if (deepLink) void completeSignInFromDeepLink(deepLink)
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    void completeSignInFromDeepLink(url)
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.whenReady().then(async () => {
    app.setName('Linkster')
    applyThemeMode(getThemeMode())
    registerIpcHandlers()
    subscribeToAuthChanges()

    createTray({
      show: showMainWindow,
      quit: () => {
        isQuitting = true
        app.quit()
      }
    })

    mainWindow = createWindow()

    applyStoredMonitoringPreference()
    startScreenshotWatcher()
    void initializeAutoUpdate()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
      } else {
        showMainWindow()
      }
    })

    await refreshAuthState()

    const initialDeepLink = findDeepLink(process.argv)
    if (initialDeepLink) await completeSignInFromDeepLink(initialDeepLink)
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
