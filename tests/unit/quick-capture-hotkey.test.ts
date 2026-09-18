import { describe, expect, it } from 'vitest'
import {
  createQuickCaptureHotkeyController,
  type HotkeyRegistration,
  type HotkeySettingsStore
} from '../../src/main/services/quick-capture-hotkey'

const DEFAULT = 'CommandOrControl+Shift+L'

function fakeRegistration(taken: string[] = []): HotkeyRegistration & { registered: Set<string> } {
  const takenSet = new Set(taken)
  const registered = new Set<string>()
  return {
    registered,
    register: (accelerator: string) => {
      if (takenSet.has(accelerator)) return false
      registered.add(accelerator)
      return true
    },
    unregister: (accelerator: string) => {
      registered.delete(accelerator)
    }
  }
}

function fakeSettings(initial: { enabled: boolean; accelerator: string }): HotkeySettingsStore & {
  state: { enabled: boolean; accelerator: string }
} {
  const state = { ...initial }
  return {
    state,
    read: () => ({ ...state }),
    write: (patch) => {
      Object.assign(state, patch)
    }
  }
}

function controller(
  registration: HotkeyRegistration & { registered: Set<string> },
  settings: HotkeySettingsStore
) {
  return createQuickCaptureHotkeyController({
    registration,
    settings,
    onTrigger: () => undefined,
    defaultAccelerator: DEFAULT
  })
}

describe('quick-capture hotkey controller', () => {
  it('registers the stored accelerator when enabled', () => {
    const registration = fakeRegistration()
    const settings = fakeSettings({ enabled: true, accelerator: DEFAULT })
    const hotkeys = controller(registration, settings)

    hotkeys.applyStored()

    expect(registration.registered.has(DEFAULT)).toBe(true)
    expect(hotkeys.getSettings()).toMatchObject({
      enabled: true,
      accelerator: DEFAULT,
      registered: true,
      error: null
    })
  })

  it('does not register when disabled', () => {
    const registration = fakeRegistration()
    const settings = fakeSettings({ enabled: false, accelerator: DEFAULT })

    controller(registration, settings).applyStored()

    expect(registration.registered.size).toBe(0)
  })

  it('keeps the previous binding, persists it, and reports a conflict', () => {
    const registration = fakeRegistration(['CommandOrControl+Shift+K'])
    const settings = fakeSettings({ enabled: true, accelerator: DEFAULT })
    const hotkeys = controller(registration, settings)
    hotkeys.applyStored()

    const result = hotkeys.apply({ accelerator: 'CommandOrControl+Shift+K' })

    expect(result.registered).toBe(true)
    // The reported accelerator is the one actually registered, not the failed
    // request; the error banner explains why the request was rejected.
    expect(result.accelerator).toBe(DEFAULT)
    expect(result.error).toMatch(/unavailable/i)
    expect(registration.registered.has(DEFAULT)).toBe(true)
    expect(settings.state.accelerator).toBe(DEFAULT)
  })

  it('falls back to the default accelerator when the stored one is taken at boot', () => {
    const registration = fakeRegistration(['CommandOrControl+Shift+K'])
    const settings = fakeSettings({ enabled: true, accelerator: 'CommandOrControl+Shift+K' })
    const hotkeys = controller(registration, settings)

    hotkeys.applyStored()

    expect(registration.registered.has(DEFAULT)).toBe(true)
    expect(settings.state.accelerator).toBe(DEFAULT)
    expect(hotkeys.getSettings().registered).toBe(true)
  })

  it('rejects an invalid accelerator without changing the stored value', () => {
    const registration = fakeRegistration()
    const settings = fakeSettings({ enabled: true, accelerator: DEFAULT })
    const hotkeys = controller(registration, settings)
    hotkeys.applyStored()

    const result = hotkeys.apply({ accelerator: 'L' })

    expect(result.error).toMatch(/not valid/i)
    expect(result.registered).toBe(true)
    expect(settings.state.accelerator).toBe(DEFAULT)
    expect(registration.registered.has(DEFAULT)).toBe(true)
  })

  it('unregisters the binding when disabled', () => {
    const registration = fakeRegistration()
    const settings = fakeSettings({ enabled: true, accelerator: DEFAULT })
    const hotkeys = controller(registration, settings)
    hotkeys.applyStored()

    const result = hotkeys.apply({ enabled: false })

    expect(result.enabled).toBe(false)
    expect(result.registered).toBe(false)
    expect(registration.registered.size).toBe(0)
  })
})
