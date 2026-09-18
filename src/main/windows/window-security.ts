import { BrowserWindow, shell } from 'electron'
import { isSafeExternalUrl } from '../services/url-validator'
import { isAllowedNavigation } from './navigation-policy'

/**
 * Denies in-app popups/navigation by default. Any http(s) target is handed to
 * the OS browser through a validated open; everything else is dropped. Shared
 * by the main window and the quick-capture overlay.
 */
export function hardenWindow(window: BrowserWindow, appUrl: string): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const guardNavigation = (event: Electron.Event, url: string): void => {
    if (isAllowedNavigation(url, appUrl)) return
    event.preventDefault()
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
  }

  window.webContents.on('will-navigate', (event, url) => guardNavigation(event, url))
  // Server-side redirects bypass will-navigate; a dev-origin page must not be
  // able to 302 the window to an external origin.
  window.webContents.on('will-redirect', (event, url) => guardNavigation(event, url))
}
