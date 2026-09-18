import type { QuickCaptureSettings, QuickCaptureSettingsPatch } from '@shared/contract/ipc'
import { isValidAccelerator } from '@shared/lib/hotkey'

export interface HotkeyRegistration {
  register(accelerator: string, handler: () => void): boolean
  unregister(accelerator: string): void
}

export interface HotkeySettingsStore {
  read(): { enabled: boolean; accelerator: string }
  write(patch: { enabled?: boolean; accelerator?: string }): void
}

export interface QuickCaptureHotkeyController {
  getSettings(): QuickCaptureSettings
  applyStored(): void
  apply(patch: QuickCaptureSettingsPatch): QuickCaptureSettings
  dispose(): void
}

export interface QuickCaptureHotkeyDeps {
  registration: HotkeyRegistration
  settings: HotkeySettingsStore
  onTrigger: () => void
  defaultAccelerator: string
}

export const HOTKEY_UNAVAILABLE_MESSAGE = 'Shortcut unavailable — it may be used by another app.'
export const HOTKEY_INVALID_MESSAGE =
  'That shortcut is not valid. Use a modifier plus a letter or key.'

/**
 * Owns quick-capture shortcut registration. Conflict handling is deliberately
 * non-destructive: a failing accelerator is reported and the previous working
 * binding is restored so capture never goes dark (AC5).
 */
export function createQuickCaptureHotkeyController(
  deps: QuickCaptureHotkeyDeps
): QuickCaptureHotkeyController {
  let bound: string | null = null
  let error: string | null = null

  function unregisterBound(): void {
    if (bound === null) return
    deps.registration.unregister(bound)
    bound = null
  }

  function bind(accelerator: string): boolean {
    try {
      if (!deps.registration.register(accelerator, deps.onTrigger)) {
        error = HOTKEY_UNAVAILABLE_MESSAGE
        return false
      }
      bound = accelerator
      error = null
      return true
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
      return false
    }
  }

  function getSettings(): QuickCaptureSettings {
    const { enabled, accelerator } = deps.settings.read()
    return { enabled, accelerator, registered: bound !== null, error }
  }

  function applyStored(): void {
    unregisterBound()
    error = null
    const { enabled, accelerator } = deps.settings.read()
    if (!enabled) return
    const stored = accelerator || deps.defaultAccelerator
    if (bind(stored)) return
    // The stored accelerator can be taken at boot (another app grabbed it).
    // Fall back to the default rather than leaving quick capture dark.
    if (stored !== deps.defaultAccelerator && bind(deps.defaultAccelerator)) {
      deps.settings.write({ enabled: true, accelerator: deps.defaultAccelerator })
    }
  }

  function apply(patch: QuickCaptureSettingsPatch): QuickCaptureSettings {
    const previous = deps.settings.read()
    const enabled = patch.enabled ?? previous.enabled
    const requested = patch.accelerator?.trim() || previous.accelerator || deps.defaultAccelerator

    if (patch.accelerator !== undefined && !isValidAccelerator(requested)) {
      unregisterBound()
      if (enabled) bind(previous.accelerator)
      error = HOTKEY_INVALID_MESSAGE
      return getSettings()
    }

    unregisterBound()

    if (!enabled) {
      deps.settings.write({ enabled: false, accelerator: requested })
      error = null
      return getSettings()
    }

    if (bind(requested)) {
      deps.settings.write({ enabled: true, accelerator: requested })
      return getSettings()
    }

    const failure = error
    // Never persist an accelerator that failed to register: on the next launch
    // it would be retried and quick capture would start dark.
    if (previous.accelerator !== requested && bind(previous.accelerator)) {
      deps.settings.write({ enabled: true, accelerator: previous.accelerator })
    }
    // Keep reporting the failed request even though the previous binding is live.
    error = failure
    return getSettings()
  }

  function dispose(): void {
    unregisterBound()
    error = null
  }

  return { getSettings, applyStored, apply, dispose }
}
