import { BrowserWindow } from 'electron'
import { IPC, type RealtimeStatus } from '@shared/contract/ipc'
import { supabase } from '../auth/supabase'
import { createChangeCoalescer } from './change-coalescer'

type RealtimeChannel = ReturnType<typeof supabase.channel>

let channel: RealtimeChannel | null = null
let lastStatus: RealtimeStatus = 'INITIAL'
const statusListeners = new Set<(status: RealtimeStatus) => void>()

/** Notifies on channel status transitions so callers can react to reconnects. */
export function subscribeRealtimeStatus(listener: (status: RealtimeStatus) => void): () => void {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

export function getRealtimeStatus(): RealtimeStatus {
  return lastStatus
}

function setRealtimeStatus(status: RealtimeStatus): void {
  const previous = lastStatus
  lastStatus = status
  for (const listener of statusListeners) listener(status)
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC.realtime.status, status)
  }

  // postgres_changes does not replay events missed while the channel was down,
  // so a reconnect must refetch server state or changes made during the gap
  // stay invisible until some unrelated refresh.
  if (status === 'SUBSCRIBED' && previous !== 'SUBSCRIBED' && previous !== 'INITIAL') {
    coalescer.schedule()
  }
}

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

  coalescer.resume()
  const current = supabase
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
    // Capture-state changes live in the side table; broadcasting them as a
    // links change keeps the X section fresh across devices.
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'link_x_posts' },
      () => coalescer.schedule()
    )
    .subscribe((status) => {
      // Ignore callbacks from a channel that was already stopped/replaced: a
      // late CLOSED from an old channel must not overwrite the new one.
      if (channel !== current) return
      setRealtimeStatus((status as RealtimeStatus) ?? 'CHANNEL_ERROR')
    })

  channel = current
}

export function stopRealtime(): void {
  const previous = channel
  channel = null
  coalescer.dispose()
  setRealtimeStatus('CLOSED')
  if (previous) {
    void supabase.removeChannel(previous).catch(() => undefined)
  }
}

/** True only while the channel is actually subscribed (not merely created). */
export function isRealtimeActive(): boolean {
  return channel !== null && lastStatus === 'SUBSCRIBED'
}
