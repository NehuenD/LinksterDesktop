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

export function labelColor(label: string): string {
  let hash = 0
  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) | 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}
