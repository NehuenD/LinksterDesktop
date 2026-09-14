import { clipboard } from 'electron'
import { store } from '../store/store'
import { captureUrl } from './capture-service'
import { ClipboardCapturePipeline } from './clipboard/capture-pipeline'
import { createNativeWatcher } from './clipboard/native-addon'
import { createPollingWatcher, type ClipboardWatcher } from './clipboard/watcher'

let watcher: ClipboardWatcher | null = null
let pipeline: ClipboardCapturePipeline | null = null
let usingNative = false

export function isMonitoring(): boolean {
  return watcher?.isRunning() ?? false
}

export function isUsingNativeWatcher(): boolean {
  return usingNative
}

export function pollingIntervalMs(): number {
  return 1000
}

function buildWatcher(onChange: (text: string) => void): ClipboardWatcher {
  const native = createNativeWatcher(onChange)
  if (native) {
    try {
      native.start()
      usingNative = true
      return native
    } catch {
      usingNative = false
    }
  }

  const polling = createPollingWatcher({
    readText: () => clipboard.readText(),
    onChange
  })
  polling.start()
  return polling
}

export function startMonitoring(): void {
  if (watcher) return

  pipeline = new ClipboardCapturePipeline({
    onCapture: (url) => {
      void captureUrl(url).catch(() => undefined)
    }
  })

  watcher = buildWatcher((text) => pipeline?.handle(text))
  store.set('clipboardMonitoring', true)
}

export function stopMonitoring(): void {
  watcher?.stop()
  pipeline?.reset()
  watcher = null
  pipeline = null
  usingNative = false
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

