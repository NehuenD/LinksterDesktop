import { describe, expect, it } from 'vitest'
import {
  DEFAULT_QUICK_CAPTURE_ACCELERATOR,
  acceleratorFromEvent,
  formatAccelerator,
  formatShortcutHint,
  isValidAccelerator
} from '@shared/lib/hotkey'

function event(
  key: string,
  mods: Partial<{
    ctrlKey: boolean
    metaKey: boolean
    shiftKey: boolean
    altKey: boolean
  }> = {}
): { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean } {
  return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods }
}

describe('acceleratorFromEvent', () => {
  it('maps ctrl to CommandOrControl and uppercases the main key', () => {
    expect(acceleratorFromEvent(event('l', { ctrlKey: true, shiftKey: true }))).toEqual({
      commandOrControl: true,
      shift: true,
      alt: false,
      key: 'L'
    })
  })

  it('maps meta to CommandOrControl', () => {
    expect(acceleratorFromEvent(event('k', { metaKey: true }))).toMatchObject({
      commandOrControl: true,
      key: 'K'
    })
  })

  it('rejects a main key with no modifier', () => {
    expect(acceleratorFromEvent(event('l'))).toBeNull()
  })

  it('rejects modifier-only keys', () => {
    expect(acceleratorFromEvent(event('Shift', { shiftKey: true }))).toBeNull()
    expect(acceleratorFromEvent(event('Control', { ctrlKey: true }))).toBeNull()
    expect(acceleratorFromEvent(event('Meta', { metaKey: true }))).toBeNull()
    expect(acceleratorFromEvent(event('Alt', { altKey: true }))).toBeNull()
  })

  it('normalizes space and function keys', () => {
    expect(acceleratorFromEvent(event(' ', { ctrlKey: true }))?.key).toBe('Space')
    expect(acceleratorFromEvent(event('F5', { ctrlKey: true }))?.key).toBe('F5')
  })

  it('rejects unsupported keys', () => {
    expect(acceleratorFromEvent(event('Dead', { ctrlKey: true }))).toBeNull()
  })
})

describe('formatAccelerator', () => {
  it('emits modifiers in canonical order with the main key last', () => {
    expect(
      formatAccelerator({ commandOrControl: true, shift: true, alt: true, key: 'L' })
    ).toBe('CommandOrControl+Shift+Alt+L')
  })

  it('omits unused modifiers', () => {
    expect(formatAccelerator({ commandOrControl: false, shift: true, alt: false, key: 'K' })).toBe(
      'Shift+K'
    )
  })
})

describe('isValidAccelerator', () => {
  it('accepts the default', () => {
    expect(isValidAccelerator(DEFAULT_QUICK_CAPTURE_ACCELERATOR)).toBe(true)
  })

  it('accepts modifier aliases and function keys', () => {
    expect(isValidAccelerator('Ctrl+L')).toBe(true)
    expect(isValidAccelerator('Cmd+Shift+F5')).toBe(true)
    expect(isValidAccelerator('Control+Alt+Space')).toBe(true)
  })

  it('rejects an accelerator with no modifier', () => {
    expect(isValidAccelerator('L')).toBe(false)
    expect(isValidAccelerator('F5')).toBe(false)
  })

  it('rejects unknown tokens', () => {
    expect(isValidAccelerator('Foo+Bar')).toBe(false)
    expect(isValidAccelerator('CommandOrControl+Shift+MouseLeft')).toBe(false)
  })

  it('rejects an empty accelerator', () => {
    expect(isValidAccelerator('')).toBe(false)
  })
})

describe('formatShortcutHint', () => {
  it('uses the command glyph on macOS and Ctrl elsewhere', () => {
    expect(formatShortcutHint('darwin', 'K')).toBe('⌘K')
    expect(formatShortcutHint('win32', 'K')).toBe('Ctrl K')
    expect(formatShortcutHint('linux', 'K')).toBe('Ctrl K')
    expect(formatShortcutHint(null, 'K')).toBe('Ctrl K')
  })
})

