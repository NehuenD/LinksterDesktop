import type {
  NotificationPreferences,
  NotificationPreferencesPatch
} from '@shared/contract/ipc'
import { store } from '../store/store'

export function getNotificationPreferences(): NotificationPreferences {
  return {
    notifyOnLinkCapture: store.get('notifyOnLinkCapture'),
    notifyOnScreenshot: store.get('notifyOnScreenshot')
  }
}

export function setNotificationPreferences(
  patch: NotificationPreferencesPatch
): NotificationPreferences {
  if (patch.notifyOnLinkCapture !== undefined) {
    store.set('notifyOnLinkCapture', patch.notifyOnLinkCapture)
  }
  if (patch.notifyOnScreenshot !== undefined) {
    store.set('notifyOnScreenshot', patch.notifyOnScreenshot)
  }
  return getNotificationPreferences()
}
