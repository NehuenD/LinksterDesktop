import { fail, type IpcResult } from '@shared/contract/ipc'

/**
 * Awaits an IPC call and maps a rejected invoke (missing handler, transport
 * failure, destroyed frame) onto the same `IpcResult` failure shape handlers
 * return. Renderer code never has to guard every call, and a rejection can no
 * longer leave awaiting UI (confirm dialogs, busy states) hanging forever.
 */
export async function settleIpc<T>(call: () => Promise<IpcResult<T>>): Promise<IpcResult<T>> {
  try {
    return await call()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail('IPC_INVOKE_FAILED', message)
  }
}
