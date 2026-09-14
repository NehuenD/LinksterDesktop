export interface PaletteItem {
  id: string
  label: string
  hint?: string
  keywords?: string
  kind: 'link' | 'label' | 'action'
}

export function filterPaletteItems<T extends PaletteItem>(
  items: readonly T[],
  query: string,
  limit = 8
): T[] {
  const normalized = query.trim().toLowerCase()
  if (normalized.length === 0) return items.slice(0, limit)

  const scored: Array<{ item: T; score: number }> = []

  for (const item of items) {
    const label = item.label.toLowerCase()
    const haystack = `${item.label} ${item.hint ?? ''} ${item.keywords ?? ''}`.toLowerCase()
    const index = haystack.indexOf(normalized)
    if (index === -1) continue

    const labelIndex = label.indexOf(normalized)
    const score = (labelIndex === 0 ? 0 : labelIndex === -1 ? 1000 : labelIndex) + index
    scored.push({ item, score })
  }

  scored.sort((a, b) => a.score - b.score)
  return scored.slice(0, limit).map((entry) => entry.item)
}
