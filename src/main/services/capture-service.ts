import { BrowserWindow, Notification } from 'electron'
import { IPC } from '@shared/contract/ipc'
import { createLink, ensureLabel, isUniqueViolation, linkExists } from '../data/link-repository'
import { store } from '../store/store'
import { fetchMetadata } from './metadata-service'
import { validateUrl } from './url-validator'

export interface CaptureResult {
  captured: boolean
  reason?: string
}

export function broadcastLinksChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC.links.changed)
  }
}

function showCaptureNotification(title: string): void {
  if (!store.get('notifyOnLinkCapture')) return
  if (!Notification.isSupported()) return
  new Notification({ title: 'Link saved', body: title }).show()
}

export async function captureUrl(rawUrl: string): Promise<CaptureResult> {
  const validation = validateUrl(rawUrl)
  if (!validation.valid) return { captured: false, reason: validation.reason }

  if (await linkExists(validation.url)) {
    return { captured: false, reason: 'duplicate' }
  }

  const metadata = await fetchMetadata(validation.url)
  const label = await ensureLabel('General')

  let link
  try {
    link = await createLink({
      url: validation.url,
      title: metadata.title,
      description: metadata.description,
      thumbnailUrl: metadata.thumbnailUrl,
      label
    })
  } catch (error) {
    if (isUniqueViolation(error)) return { captured: false, reason: 'duplicate' }
    throw error
  }

  broadcastLinksChanged()
  showCaptureNotification(link.title ?? validation.url)

  return { captured: true }
}
