export function toggleId(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]
}

/**
 * Shift-click range selection: selects every id between the anchor and the
 * target in the currently rendered order, added to whatever is already selected.
 * Falls back to a plain toggle when there is no usable anchor.
 */
export function rangeSelection(
  orderedIds: readonly string[],
  anchorId: string | null,
  targetId: string,
  selected: readonly string[]
): string[] {
  if (!anchorId) return toggleId(selected, targetId)

  const from = orderedIds.indexOf(anchorId)
  const to = orderedIds.indexOf(targetId)
  if (from < 0 || to < 0) return toggleId(selected, targetId)

  const [start, end] = from <= to ? [from, to] : [to, from]
  const range = orderedIds.slice(start, end + 1)
  return Array.from(new Set([...selected, ...range]))
}
