import { registerAuthHandlers } from './handlers/auth'
import { registerClipboardHandlers } from './handlers/clipboard'
import { registerDataHandlers } from './handlers/data'
import { registerLabelHandlers } from './handlers/labels'
import { registerLinkHandlers } from './handlers/links'
import { registerQuickCaptureHandlers } from './handlers/quick-capture'
import { registerRealtimeHandlers } from './handlers/realtime'
import { registerScreenshotHandlers } from './handlers/screenshots'
import { registerSettingsHandlers } from './handlers/settings'
import { registerSystemHandlers } from './handlers/system'
import { registerXHandlers } from './handlers/x'

export function registerIpcHandlers(): void {
  registerSystemHandlers()
  registerAuthHandlers()
  registerLinkHandlers()
  registerLabelHandlers()
  registerClipboardHandlers()
  registerSettingsHandlers()
  registerDataHandlers()
  registerScreenshotHandlers()
  registerQuickCaptureHandlers()
  registerXHandlers()
  registerRealtimeHandlers()
}
