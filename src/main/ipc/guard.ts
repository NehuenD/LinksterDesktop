import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { fail, type IpcResult } from '@shared/contract/ipc'

type HandlerFn = (
  event: IpcMainInvokeEvent,
  ...args: unknown[]
) => IpcResult<unknown> | Promise<IpcResult<unknown>>

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The renderer may only call from the main frame of one of our own windows. In
 * dev that is the Vite origin; in production it must be the app's own renderer
 * documents — not any `file:` page that happens to be in a BrowserWindow (the
 * X capture fallback card is one).
 */
export function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  if (!BrowserWindow.fromWebContents(event.sender)) return false
  // Preloads run in subframes too; only the main frame may use the bridge.
  if (event.senderFrame?.parent) return false
  try {
    const frameUrl = event.senderFrame?.url
    if (!frameUrl) return false
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    const parsed = new URL(frameUrl)
    if (devUrl) return parsed.origin === new URL(devUrl).origin
    return (
      parsed.protocol === 'file:' &&
      /\/(index|quick-capture)\.html$/.test(parsed.pathname)
    )
  } catch {
    return false
  }
}

/**
 * Registers an IPC handler behind a sender allow-list and a catch-all so a
 * handler can never reject the `invoke` promise (the renderer always receives
 * an `IpcResult`).
 */
export function secureHandle(channel: string, handler: HandlerFn): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedSender(event)) {
      return fail('UNTRUSTED_SENDER', 'Rejected IPC from an untrusted sender.')
    }
    try {
      return await handler(event, ...args)
    } catch (error) {
      return fail('IPC_HANDLER_FAILED', toMessage(error))
    }
  })
}
