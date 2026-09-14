import { registerSystemHandlers } from './handlers/system'

export function registerIpcHandlers(): void {
  registerSystemHandlers()
}
