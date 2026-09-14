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
import { createMainWindow } from './windows/main-window'

const userDataDir = process.env['LINKSTER_USER_DATA_DIR']
if (userDataDir) {
  app.setPath('userData', userDataDir)
}

let mainWindow: BrowserWindow | null = null

function focusMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
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
    focusMainWindow()
    const deepLink = findDeepLink(argv)
    if (deepLink) void completeSignInFromDeepLink(deepLink)
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    void completeSignInFromDeepLink(url)
  })

  app.whenReady().then(async () => {
    app.setName('Linkster')
    applyThemeMode(getThemeMode())
    registerIpcHandlers()
    subscribeToAuthChanges()

    mainWindow = createMainWindow()

    applyStoredMonitoringPreference()
    startScreenshotWatcher()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
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
