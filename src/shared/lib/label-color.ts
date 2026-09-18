const PALETTE = [
  '#DC2626',
  '#F43F5E',
  '#2563EB',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
  '#F97316',
  '#14B8A6',
  '#6366F1',
  '#EAB308'
] as const

/** Colors offered in the label color picker. */
export const LABEL_PALETTE = PALETTE

/** Human-readable names for the palette, used for tooltips and screen readers. */
export const LABEL_COLOR_NAMES: Record<string, string> = {
  '#DC2626': 'Red',
  '#F43F5E': 'Rose',
  '#2563EB': 'Blue',
  '#10B981': 'Emerald',
  '#F59E0B': 'Amber',
  '#8B5CF6': 'Violet',
  '#EC4899': 'Pink',
  '#06B6D4': 'Cyan',
  '#84CC16': 'Lime',
  '#F97316': 'Orange',
  '#14B8A6': 'Teal',
  '#6366F1': 'Indigo',
  '#EAB308': 'Yellow'
}

/** User-chosen label colors, keyed by label name. */
export type LabelColors = Record<string, string>

/** Matches a 6-digit hex color such as `#10B981`. */
export const LABEL_COLOR_PATTERN = /^#[0-9A-F]{6}$/i

export function isValidLabelColor(value: unknown): value is string {
  return typeof value === 'string' && LABEL_COLOR_PATTERN.test(value)
}

/**
 * The deterministic palette color derived from a label's name. Used when a
 * label has no custom color, and as the "Default" option in the picker.
 */
export function autoColor(label: string): string {
  let hash = 0
  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) | 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

/**
 * Resolves the color for a label: the user's custom color when present,
 * otherwise the deterministic name-based color.
 */
export function labelColor(label: string, colors?: LabelColors): string {
  const custom = colors?.[label]
  if (custom) return custom
  return autoColor(label)
}

/** Returns a copy of `colors` with `label` set to `color` (or removed when null). */
export function withLabelColor(
  colors: LabelColors,
  label: string,
  color: string | null
): LabelColors {
  const next = { ...colors }
  if (color === null) {
    delete next[label]
  } else {
    next[label] = color
  }
  return next
}

/** Returns a copy of `colors` with `label`'s color removed. */
export function withoutLabelColor(colors: LabelColors, label: string): LabelColors {
  if (colors[label] === undefined) return colors
  const next = { ...colors }
  delete next[label]
  return next
}

/**
 * Moves a custom color from `oldName` to `newName` on rename. The target's
 * existing color wins; the old color is discarded.
 */
export function withLabelRenamed(
  colors: LabelColors,
  oldName: string,
  newName: string
): LabelColors {
  if (oldName === newName) return colors
  const oldColor = colors[oldName]
  if (oldColor === undefined) return colors

  const next = { ...colors }
  delete next[oldName]
  if (next[newName] === undefined) next[newName] = oldColor
  return next
}

/**
 * Adopts `source`'s custom color into `target` on merge. The target's existing
 * color wins; the source color is removed regardless.
 */
export function withLabelMerged(
  colors: LabelColors,
  source: string,
  target: string
): LabelColors {
  const sourceColor = colors[source]
  if (sourceColor === undefined) return colors

  const next = { ...colors }
  delete next[source]
  if (next[target] === undefined) next[target] = sourceColor
  return next
}
