import { globalShortcut } from 'electron'
import type { QuickCaptureSettings, QuickCaptureSettingsPatch } from '@shared/contract/ipc'
import { DEFAULT_QUICK_CAPTURE_ACCELERATOR } from '@shared/lib/hotkey'
import { store } from '../store/store'
import { toggleQuickCaptureOverlay } from '../windows/quick-capture-window'
import { createQuickCaptureHotkeyController } from './quick-capture-hotkey'

const controller = createQuickCaptureHotkeyController({
  registration: {
    register: (accelerator, handler) => globalShortcut.register(accelerator, handler),
    unregister: (accelerator) => globalShortcut.unregister(accelerator)
  },
  settings: {
    read: () => ({
      enabled: store.get('quickCaptureEnabled'),
      accelerator: store.get('quickCaptureHotkey')
    }),
    write: (patch) => {
      if (patch.enabled !== undefined) store.set('quickCaptureEnabled', patch.enabled)
      if (patch.accelerator !== undefined) store.set('quickCaptureHotkey', patch.accelerator)
    }
  },
  onTrigger: toggleQuickCaptureOverlay,
  defaultAccelerator: DEFAULT_QUICK_CAPTURE_ACCELERATOR
})

export function getQuickCaptureSettings(): QuickCaptureSettings {
  return controller.getSettings()
}

export function applyQuickCaptureSettings(
  patch: QuickCaptureSettingsPatch
): QuickCaptureSettings {
  return controller.apply(patch)
}

export function applyStoredQuickCapturePreference(): void {
  controller.applyStored()
}

export function disposeQuickCaptureHotkey(): void {
  controller.dispose()
}
