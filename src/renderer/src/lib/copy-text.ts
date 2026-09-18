import { settleIpc } from '@shared/lib/ipc-call'
import { api } from './api'
import { reportError, reportSuccess } from '../store/toast-store'

/** Copies text through the main-process clipboard, surfacing failures. */
export async function copyText(text: string, message = 'Copied to clipboard'): Promise<void> {
  const result = await settleIpc(() => api.system.copyText(text))
  if (!result.ok) reportError(result.error.message)
  else reportSuccess(message)
}
