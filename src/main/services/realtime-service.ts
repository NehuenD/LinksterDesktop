import { BrowserWindow } from 'electron'
import { IPC } from '@shared/contract/ipc'
import { supabase } from '../auth/supabase'
import { createChangeCoalescer } from './change-coalescer'

type RealtimeChannel = ReturnType<typeof supabase.channel>

let channel: RealtimeChannel | null = null

function broadcastLinksChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC.links.changed)
  }
}

// Coalesces bursts of row changes into a single renderer refresh. Reloading the
// server state is the last-write-wins reconciliation: the database row wins.
const coalescer = createChangeCoalescer(broadcastLinksChanged, 250)

export function startRealtime(): void {
  if (channel) return

  channel = supabase
    .channel('linkster-db-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'links' },
      () => coalescer.schedule()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'labels' },
      () => coalescer.schedule()
    )
    .subscribe()
}

export function stopRealtime(): void {
  if (!channel) return
  void supabase.removeChannel(channel)
  channel = null
  coalescer.dispose()
}

export function isRealtimeActive(): boolean {
  return channel !== null
}
