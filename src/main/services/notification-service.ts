import { Notification } from 'electron'
import type { NotificationPermission } from '@shared/contract/ipc'

/**
 * Electron does not expose an OS notification-permission query. We report
 * `granted` when the platform supports notifications and `unsupported` when it
 * does not; showing the first notification raises the OS prompt on macOS.
 */
export function getNotificationPermission(): NotificationPermission {
  return Notification.isSupported() ? 'granted' : 'unsupported'
}

/** Shows a test notification, which is also how the OS prompt is triggered. */
export function requestNotificationPermission(): NotificationPermission {
  if (!Notification.isSupported()) return 'unsupported'
  new Notification({
    title: 'Linkster',
    body: 'Notifications are enabled.'
  }).show()
  return 'granted'
}
