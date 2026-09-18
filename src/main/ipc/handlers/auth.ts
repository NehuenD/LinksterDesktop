import { IPC, fail, ok } from '@shared/contract/ipc'
import { getAuthState } from '../../auth/auth-state'
import { signInWithGoogle, signOut } from '../../auth/auth-service'
import { secureHandle } from '../guard'

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerAuthHandlers(): void {
  secureHandle(IPC.auth.getState, () => ok(getAuthState()))

  secureHandle(IPC.auth.signInWithGoogle, async () => {
    try {
      await signInWithGoogle()
      return ok(true as const)
    } catch (error) {
      return fail('AUTH_SIGN_IN_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.auth.signOut, async () => {
    try {
      await signOut()
      return ok(true as const)
    } catch (error) {
      return fail('AUTH_SIGN_OUT_FAILED', toMessage(error))
    }
  })
}
