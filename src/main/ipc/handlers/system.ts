import { BrowserWindow, app, clipboard, shell } from 'electron'
import {
  IPC,
  ThemeModeSchema,
  createPingResponse,
  fail,
  ok,
  type AppInfo,
  type ThemeMode
} from '@shared/contract/ipc'
import { isSafeExternalUrl } from '../../services/url-validator'
import { getThemeMode, setThemeMode } from '../../services/theme-service'
import { secureHandle } from '../guard'

function senderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

export function registerSystemHandlers(): void {
  secureHandle(IPC.system.ping, () => ok(createPingResponse()))

  secureHandle(IPC.system.getAppInfo, () =>
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

  secureHandle(IPC.system.themeGet, () => ok(getThemeMode()))

  secureHandle(IPC.system.themeSet, (_event, mode: unknown) => {
    const parsed = ThemeModeSchema.safeParse(mode)
    if (!parsed.success) return fail('INVALID_THEME', 'Unknown theme mode.')
    return ok<ThemeMode>(setThemeMode(parsed.data))
  })

  secureHandle(IPC.system.openExternal, async (_event, url: unknown) => {
    if (!isSafeExternalUrl(url)) {
      return fail('INVALID_URL', 'Only http(s) URLs can be opened.')
    }
    await shell.openExternal(url)
    return ok(true as const)
  })

  secureHandle(IPC.system.copyText, (_event, text: unknown) => {
    if (typeof text !== 'string' || text.length === 0 || text.length > 10_000) {
      return fail('INVALID_TEXT', 'Text to copy is required.')
    }
    clipboard.writeText(text)
    return ok(true as const)
  })

  secureHandle(IPC.system.windowMinimize, (event) => {
    senderWindow(event)?.minimize()
    return ok(true as const)
  })

  secureHandle(IPC.system.windowToggleMaximize, (event) => {
    const window = senderWindow(event)
    if (!window) return ok(false)
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
    return ok(window.isMaximized())
  })

  secureHandle(IPC.system.windowClose, (event) => {
    senderWindow(event)?.close()
    return ok(true as const)
  })
}
