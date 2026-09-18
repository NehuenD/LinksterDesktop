import { describe, expect, it } from 'vitest'
import { rangeSelection, toggleId } from '@shared/lib/selection'

describe('toggleId', () => {
  it('adds when absent and removes when present', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('rangeSelection', () => {
  const order = ['a', 'b', 'c', 'd', 'e']

  it('selects the inclusive range from the anchor to the target', () => {
    expect(rangeSelection(order, 'b', 'd', [])).toEqual(['b', 'c', 'd'])
  })

  it('works when the target is before the anchor', () => {
    expect(rangeSelection(order, 'd', 'b', [])).toEqual(['b', 'c', 'd'])
  })

  it('merges range ids with the existing selection without duplicates', () => {
    expect(rangeSelection(order, 'b', 'c', ['a', 'b'])).toEqual(['a', 'b', 'c'])
  })

  it('falls back to a toggle when there is no anchor', () => {
    expect(rangeSelection(order, null, 'c', [])).toEqual(['c'])
  })

  it('falls back to a toggle when the anchor is no longer visible', () => {
    expect(rangeSelection(order, 'zzz', 'c', [])).toEqual(['c'])
  })
})
