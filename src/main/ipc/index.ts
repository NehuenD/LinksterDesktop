import { registerAuthHandlers } from './handlers/auth'
import { registerLabelHandlers } from './handlers/labels'
import { registerLinkHandlers } from './handlers/links'
import { registerSystemHandlers } from './handlers/system'

export function registerIpcHandlers(): void {
  registerSystemHandlers()
  registerAuthHandlers()
  registerLinkHandlers()
  registerLabelHandlers()
}
