import { describe, expect, it } from 'vitest'
import { filterPaletteItems, type PaletteItem } from '@shared/lib/palette'

const items: PaletteItem[] = [
  { id: '1', label: 'Design systems', hint: 'https://a.example', kind: 'link' },
  { id: '2', label: 'TypeScript handbook', hint: 'https://b.example', kind: 'link' },
  { id: '3', label: 'Label: News', keywords: 'filter', kind: 'label' },
  { id: '4', label: 'Add link', keywords: 'new create', kind: 'action' }
]

describe('filterPaletteItems', () => {
  it('returns the first items for an empty query', () => {
    expect(filterPaletteItems(items, '', 2).map((item) => item.id)).toEqual(['1', '2'])
  })

  it('ranks label-prefix matches first', () => {
    const results = filterPaletteItems(items, 'type', 5)
    expect(results[0].id).toBe('2')
  })

  it('matches on hint and keywords', () => {
    expect(filterPaletteItems(items, 'a.example', 5).map((item) => item.id)).toEqual(['1'])
    expect(filterPaletteItems(items, 'create', 5).map((item) => item.id)).toEqual(['4'])
  })

  it('returns nothing when there is no match', () => {
    expect(filterPaletteItems(items, 'zzzz', 5)).toEqual([])
  })

  it('respects the limit', () => {
    expect(filterPaletteItems(items, '', 1)).toHaveLength(1)
  })
})
