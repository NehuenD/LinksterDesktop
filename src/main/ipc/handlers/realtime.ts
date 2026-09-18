import { IPC, ok } from '@shared/contract/ipc'
import { getRealtimeStatus } from '../../services/realtime-service'
import { secureHandle } from '../guard'

export function registerRealtimeHandlers(): void {
  secureHandle(IPC.realtime.getStatus, () => ok(getRealtimeStatus()))
}
