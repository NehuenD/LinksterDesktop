import { BrowserWindow, app, ipcMain } from 'electron'
import {
  IPC,
  ThemeModeSchema,
  createPingResponse,
  ok,
  type AppInfo,
  type ThemeMode
} from '@shared/contract/ipc'
import { getThemeMode, setThemeMode } from '../../services/theme-service'

function senderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

export function registerSystemHandlers(): void {
  ipcMain.handle(IPC.system.ping, () => ok(createPingResponse()))

  ipcMain.handle(IPC.system.getAppInfo, () =>
    ok<AppInfo>({
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch
    })
  )

  ipcMain.handle(IPC.system.themeGet, () => ok(getThemeMode()))

  ipcMain.handle(IPC.system.themeSet, (_event, mode: unknown) =>
    ok<ThemeMode>(setThemeMode(ThemeModeSchema.parse(mode)))
  )

  ipcMain.handle(IPC.system.windowMinimize, (event) => {
    senderWindow(event)?.minimize()
    return ok(true as const)
  })

  ipcMain.handle(IPC.system.windowToggleMaximize, (event) => {
    const window = senderWindow(event)
    if (!window) return ok(false)
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
    return ok(window.isMaximized())
  })

  ipcMain.handle(IPC.system.windowClose, (event) => {
    senderWindow(event)?.close()
    return ok(true as const)
  })
}
