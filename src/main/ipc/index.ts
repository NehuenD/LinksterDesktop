import { registerAuthHandlers } from './handlers/auth'
import { registerClipboardHandlers } from './handlers/clipboard'
import { registerDataHandlers } from './handlers/data'
import { registerLabelHandlers } from './handlers/labels'
import { registerLinkHandlers } from './handlers/links'
import { registerSettingsHandlers } from './handlers/settings'
import { registerSystemHandlers } from './handlers/system'

export function registerIpcHandlers(): void {
  registerSystemHandlers()
  registerAuthHandlers()
  registerLinkHandlers()
  registerLabelHandlers()
  registerClipboardHandlers()
  registerSettingsHandlers()
  registerDataHandlers()
}
