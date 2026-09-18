import { secureHandle } from '../guard'
import { IPC, fail, ok } from '@shared/contract/ipc'
import {
  getQuickCaptureContext,
  hideQuickCaptureOverlay,
  setQuickCaptureDirty
} from '../../windows/quick-capture-window'

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerQuickCaptureHandlers(): void {
  secureHandle(IPC.quickCapture.getContext, async () => {
    try {
      return ok(await getQuickCaptureContext())
    } catch (error) {
      return fail('QUICK_CAPTURE_CONTEXT_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.quickCapture.hide, () => {
    hideQuickCaptureOverlay()
    return ok(true as const)
  })

  secureHandle(IPC.quickCapture.setDirty, (_event, dirty: unknown) => {
    if (typeof dirty !== 'boolean') {
      return fail('INVALID_ARGUMENT', 'Dirty must be a boolean.')
    }
    setQuickCaptureDirty(dirty)
    return ok(true as const)
  })
}
