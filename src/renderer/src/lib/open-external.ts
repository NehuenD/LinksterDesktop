import { settleIpc } from '@shared/lib/ipc-call'
import { api } from './api'
import { reportError } from '../store/toast-store'

/** Opens a URL in the system browser, surfacing failures instead of swallowing them. */
export async function openExternal(url: string): Promise<void> {
  const result = await settleIpc(() => api.system.openExternal(url))
  if (!result.ok) reportError(result.error.message)
}
