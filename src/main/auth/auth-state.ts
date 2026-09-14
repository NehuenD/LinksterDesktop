import { BrowserWindow } from 'electron'
import { IPC, initialAuthState, type AuthStateSnapshot } from '@shared/contract/ipc'

let current: AuthStateSnapshot = initialAuthState

export function getAuthState(): AuthStateSnapshot {
  return current
}

export function setAuthState(next: AuthStateSnapshot): void {
  current = next
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC.auth.changed, current)
    }
  }
}
