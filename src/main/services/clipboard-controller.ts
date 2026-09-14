import { clipboard } from 'electron'
import { store } from '../store/store'
import { captureUrl } from './capture-service'
import { ClipboardCapturePipeline } from './clipboard/capture-pipeline'
import {
  DEFAULT_POLL_INTERVAL_MS,
  createClipboardWatcher,
  type ClipboardWatcher
} from './clipboard/watcher'

let watcher: ClipboardWatcher | null = null
let pipeline: ClipboardCapturePipeline | null = null

export function isMonitoring(): boolean {
  return watcher?.isRunning() ?? false
}

export function pollingIntervalMs(): number {
  return DEFAULT_POLL_INTERVAL_MS
}

export function startMonitoring(): void {
  if (watcher) return

  pipeline = new ClipboardCapturePipeline({
    onCapture: (url) => {
      void captureUrl(url).catch(() => undefined)
    }
  })

  watcher = createClipboardWatcher({
    readText: () => clipboard.readText(),
    onChange: (text) => pipeline?.handle(text)
  })

  watcher.start()
  store.set('clipboardMonitoring', true)
}

export function stopMonitoring(): void {
  watcher?.stop()
  pipeline?.reset()
  watcher = null
  pipeline = null
  store.set('clipboardMonitoring', false)
}

export function setMonitoring(enabled: boolean): boolean {
  if (enabled) startMonitoring()
  else stopMonitoring()
  return isMonitoring()
}

export function applyStoredMonitoringPreference(): void {
  if (store.get('clipboardMonitoring')) startMonitoring()
}
