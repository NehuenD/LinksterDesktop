import { registerAuthHandlers } from './handlers/auth'
import { registerSystemHandlers } from './handlers/system'

export function registerIpcHandlers(): void {
  registerSystemHandlers()
  registerAuthHandlers()
}
