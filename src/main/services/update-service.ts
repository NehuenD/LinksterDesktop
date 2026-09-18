import { app } from 'electron'

function isSecureFeedUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Opt-in auto-update. Enabled only for packaged builds when a generic feed URL
 * is provided via LINKSTER_UPDATE_URL; inert otherwise (unsigned dev builds).
 *
 * Security notes: builds are currently unsigned, so electron-updater's code
 * signature verification is a no-op. We therefore refuse cleartext feeds and
 * never download or install automatically; the check only surfaces availability
 * in the log. Flip `autoDownload` back on once signing/publish metadata exist.
 */
export async function initializeAutoUpdate(): Promise<void> {
  const feedUrl = process.env['LINKSTER_UPDATE_URL']
  if (!app.isPackaged || !feedUrl) return

  if (!isSecureFeedUrl(feedUrl)) {
    console.warn('[update] LINKSTER_UPDATE_URL must use https; auto-update disabled.')
    return
  }

  try {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.on('error', (error) => {
      console.warn('[update] check failed:', error instanceof Error ? error.message : error)
    })
    autoUpdater.on('update-available', (info) => {
      console.warn('[update] update available:', info.version)
    })
    await autoUpdater.checkForUpdates()
  } catch (error) {
    console.warn('[update] disabled:', error instanceof Error ? error.message : error)
  }
}
