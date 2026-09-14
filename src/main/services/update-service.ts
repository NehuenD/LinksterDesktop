import { app } from 'electron'

/**
 * Opt-in auto-update. Enabled only for packaged builds when a generic feed URL
 * is provided via LINKSTER_UPDATE_URL; inert otherwise (unsigned dev builds).
 */
export async function initializeAutoUpdate(): Promise<void> {
  const feedUrl = process.env['LINKSTER_UPDATE_URL']
  if (!app.isPackaged || !feedUrl) return

  try {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })
    autoUpdater.autoDownload = true
    autoUpdater.on('error', () => undefined)
    await autoUpdater.checkForUpdatesAndNotify()
  } catch {
    // Auto-update is optional; ignore failures.
  }
}
