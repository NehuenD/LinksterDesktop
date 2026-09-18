import { resolve } from 'node:path'
import { BrowserWindow, app, net, session } from 'electron'
import {
  completeSignInFromDeepLink,
  refreshAuthState,
  subscribeToAuthChanges
} from './auth/auth-service'
import { PROTOCOL, findDeepLink } from './auth/deep-link'
import { getAuthState, subscribeAuthState } from './auth/auth-state'
import { registerIpcHandlers } from './ipc'
import { startBackupScheduler, stopBackupScheduler } from './services/backup-scheduler'
import { drainOutbox } from './services/capture-service'
import { applyStoredMonitoringPreference, stopMonitoring } from './services/clipboard-controller'
import {
  applyStoredQuickCapturePreference,
  disposeQuickCaptureHotkey
} from './services/hotkey-service'
import { createOutboxDrainer } from './services/outbox-drainer'
import { subscribeRealtimeStatus } from './services/realtime-service'
import { startScreenshotWatcher } from './services/screenshot-service'
import { applyThemeMode, getThemeMode } from './services/theme-service'
import { createTray, hasTray } from './services/tray-service'
import { initializeAutoUpdate } from './services/update-service'
import {
  installXCapturePipeline,
  reconcileXCaptures,
  xCaptureService
} from './services/x-capture-instance'
import { createMainWindow } from './windows/main-window'
import {
  destroyQuickCaptureOverlay,
  prewarmQuickCaptureOverlay
} from './windows/quick-capture-window'

const userDataDir = process.env['LINKSTER_USER_DATA_DIR']
if (userDataDir) {
  app.setPath('userData', userDataDir)
}

let mainWindow: BrowserWindow | null = null
let isQuitting = false

const outboxDrainer = createOutboxDrainer({
  drain: drainOutbox,
  canDrain: () => net.isOnline() && getAuthState().status === 'authenticated'
})

// Rendering captures is slow; the queue drains independently of link capture
// so a blocking render can never delay or fail a persisted link.
const xCaptureDrainer = createOutboxDrainer({
  drain: () => xCaptureService.runPass(),
  canDrain: () => net.isOnline() && getAuthState().status === 'authenticated'
})

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function attachWindowBehavior(window: BrowserWindow): void {
  window.on('close', (event) => {
    if (isQuitting || userDataDir) return
    // Close-to-tray only makes sense when a tray icon exists; hiding without
    // one would leave an invisible process the user cannot restore or quit.
    if (!hasTray()) return
    event.preventDefault()
    window.hide()
  })

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
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

  app.on('will-quit', () => {
    stopBackupScheduler()
    disposeQuickCaptureHotkey()
    destroyQuickCaptureOverlay()
  })

  app.whenReady().then(async () => {
    app.setName('Linkster')
    // Electron auto-approves permission requests when no handler is set; the
    // app needs none of them (camera/mic/geolocation/notifications/USB/...).
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false)
    })
    session.defaultSession.setPermissionCheckHandler(() => false)
    session.defaultSession.setDevicePermissionHandler(() => false)
    applyThemeMode(getThemeMode())
    registerIpcHandlers()
    subscribeToAuthChanges()

    // Realtime reconnects (including post-auth recovery) are a natural retry point.
    subscribeRealtimeStatus((status) => {
      if (status === 'SUBSCRIBED') {
        void outboxDrainer.trigger()
        void xCaptureDrainer.trigger()
      }
    })

    createTray({
      show: showMainWindow,
      quit: () => {
        isQuitting = true
        app.quit()
      }
    })

    mainWindow = createWindow()

    // Clipboard capture is an authenticated feature: it starts on sign-in and
    // stops on sign-out so nothing is read (or queued) for a signed-out user.
    subscribeAuthState((state) => {
      if (state.status === 'authenticated') applyStoredMonitoringPreference()
      else stopMonitoring()
    })
    prewarmQuickCaptureOverlay()
    applyStoredQuickCapturePreference()
    installXCapturePipeline()
    outboxDrainer.start()
    void outboxDrainer.trigger()
    xCaptureDrainer.start()
    startScreenshotWatcher()
    startBackupScheduler()
    void initializeAutoUpdate()

    app.on('activate', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createWindow()
      } else {
        showMainWindow()
      }
    })

    await refreshAuthState()

    const initialDeepLink = findDeepLink(process.argv)
    if (initialDeepLink) await completeSignInFromDeepLink(initialDeepLink)

    // Reconcile only after the session is resolved: running it while
    // unauthenticated (or under the wrong account) could sweep another user's
    // local captures.
    void reconcileXCaptures().then(() => {
      xCaptureDrainer.trigger()
      outboxDrainer.trigger()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
