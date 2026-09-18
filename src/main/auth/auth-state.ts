import { BrowserWindow } from 'electron'
import { IPC, initialAuthState, type AuthStateSnapshot } from '@shared/contract/ipc'

let current: AuthStateSnapshot = initialAuthState

/** In-process listeners (clipboard monitoring, drainer gating); never webContents. */
type AuthStateListener = (state: AuthStateSnapshot) => void
const listeners = new Set<AuthStateListener>()

export function getAuthState(): AuthStateSnapshot {
  return current
}

export function subscribeAuthState(listener: AuthStateListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setAuthState(next: AuthStateSnapshot): void {
  current = next
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC.auth.changed, current)
    }
  }
  for (const listener of listeners) {
    try {
      listener(current)
    } catch {
      // Lifecycle side effects must never break an auth transition.
    }
  }
}
