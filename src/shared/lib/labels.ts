export const PROTECTED_LABELS = ['general']

export function isProtectedLabel(name: string): boolean {
  return PROTECTED_LABELS.includes(name.trim().toLowerCase())
}

export function normalizeLabelName(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    throw new Error('Label name cannot be empty.')
  }
  return trimmed
}
