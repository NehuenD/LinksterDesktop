import { BrowserWindow, app } from 'electron'
import { registerIpcHandlers } from './ipc'
import { applyThemeMode, getThemeMode } from './services/theme-service'
import { createMainWindow } from './windows/main-window'

let mainWindow: BrowserWindow | null = null

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    app.setName('Linkster')
    applyThemeMode(getThemeMode())
    registerIpcHandlers()

    mainWindow = createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
