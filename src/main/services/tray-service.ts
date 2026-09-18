import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Menu, Tray, app, nativeImage } from 'electron'
import { buildTrayMenuTemplate, type TrayMenuHandlers } from './tray-menu'

let tray: Tray | null = null

function iconPath(): string | null {
  // Packaged builds copy the file to `resources/tray.png` via extraResources;
  // the asar-relative path is a fallback so a misconfigured package still gets
  // a tray instead of an invisible window with no way to quit.
  const candidates = app.isPackaged
    ? [
        join(process.resourcesPath, 'tray.png'),
        join(app.getAppPath(), 'resources', 'tray.png')
      ]
    : [join(app.getAppPath(), 'resources', 'tray.png')]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

export function createTray(handlers: TrayMenuHandlers): boolean {
  if (tray) return true

  const path = iconPath()
  if (!path) return false

  try {
    const image = nativeImage.createFromPath(path)
    if (image.isEmpty()) return false

    tray = new Tray(image)
    tray.setToolTip('Linkster')
    tray.setContextMenu(
      Menu.buildFromTemplate(
        buildTrayMenuTemplate(handlers) as Electron.MenuItemConstructorOptions[]
      )
    )
    tray.on('click', handlers.show)
    return true
  } catch {
    tray = null
    return false
  }
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

export function hasTray(): boolean {
  return tray !== null
}
