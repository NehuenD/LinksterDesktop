export const DEFAULT_QUICK_CAPTURE_ACCELERATOR = 'CommandOrControl+Shift+L'

export interface AcceleratorParts {
  commandOrControl: boolean
  shift: boolean
  alt: boolean
  key: string
}

type ModifierFlag = 'commandOrControl' | 'shift' | 'alt'

const MODIFIER_TOKENS: Record<string, ModifierFlag> = {
  commandorcontrol: 'commandOrControl',
  cmdorctrl: 'commandOrControl',
  command: 'commandOrControl',
  cmd: 'commandOrControl',
  control: 'commandOrControl',
  ctrl: 'commandOrControl',
  shift: 'shift',
  alt: 'alt',
  option: 'alt'
}

const NAMED_KEYS = [
  'Space',
  'Enter',
  'Return',
  'Tab',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Up',
  'Down',
  'Left',
  'Right',
  'Escape',
  'Esc'
]

const EVENT_KEY_ALIASES: Record<string, string> = {
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  esc: 'Escape',
  spacebar: 'Space'
}

/** Normalizes a raw key token to an Electron main key, or null when unsupported. */
function normalizeMainKey(raw: string): string | null {
  if (raw === ' ') return 'Space'

  const trimmed = raw.trim()
  if (trimmed.length === 0) return null

  const lower = trimmed.toLowerCase()

  const alias = EVENT_KEY_ALIASES[lower]
  if (alias) return alias

  if (/^[a-z]$/.test(lower)) return lower.toUpperCase()
  if (/^[0-9]$/.test(lower)) return lower
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) return lower.toUpperCase()

  const named = NAMED_KEYS.find((name) => name.toLowerCase() === lower)
  return named ?? null
}

/**
 * Maps a keyboard event to accelerator parts. Requires at least one modifier
 * and a supported main key; returns null otherwise.
 */
export function acceleratorFromEvent(event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}): AcceleratorParts | null {
  const commandOrControl = event.ctrlKey || event.metaKey
  const shift = event.shiftKey
  const alt = event.altKey

  if (!commandOrControl && !shift && !alt) return null

  const key = normalizeMainKey(event.key)
  if (!key) return null

  return { commandOrControl, shift, alt, key }
}

/** Emits an Electron accelerator with modifiers in canonical order, key last. */
export function formatAccelerator(parts: AcceleratorParts): string {
  const tokens: string[] = []
  if (parts.commandOrControl) tokens.push('CommandOrControl')
  if (parts.shift) tokens.push('Shift')
  if (parts.alt) tokens.push('Alt')
  tokens.push(parts.key)
  return tokens.join('+')
}

/**
 * Renders a shortcut hint for a `process.platform` value: `⌘K` on macOS and
 * `Ctrl K` elsewhere.
 */
export function formatShortcutHint(platform: string | null | undefined, key: string): string {
  return platform === 'darwin' ? `⌘${key}` : `Ctrl ${key}`
}

/** Structural validation for a user-supplied accelerator string. */
export function isValidAccelerator(accelerator: string): boolean {
  const tokens = accelerator
    .split('+')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)

  if (tokens.length < 2) return false

  const mainKey = tokens[tokens.length - 1]
  if (normalizeMainKey(mainKey) === null) return false

  let modifiers = 0
  for (const token of tokens.slice(0, -1)) {
    if (MODIFIER_TOKENS[token.toLowerCase()]) modifiers += 1
    else return false
  }

  return modifiers > 0
}
