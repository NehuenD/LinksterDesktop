import { describe, expect, it } from 'vitest'
import { sectionListState } from '../../src/shared/lib/section-state'

describe('sectionListState', () => {
  it('shows only the error state when the first load failed with nothing cached', () => {
    expect(
      sectionListState({ status: 'error', hasError: true, itemCount: 0, pendingCount: 0 })
    ).toBe('error')
  })

  it('shows loading while the first page is in flight', () => {
    expect(
      sectionListState({ status: 'loading', hasError: false, itemCount: 0, pendingCount: 0 })
    ).toBe('loading')
  })

  it('shows the empty state only when the load succeeded with no items', () => {
    expect(
      sectionListState({ status: 'idle', hasError: false, itemCount: 0, pendingCount: 0 })
    ).toBe('empty')
  })

  it('keeps rendering content when an error happens but items are already on screen', () => {
    expect(
      sectionListState({ status: 'idle', hasError: true, itemCount: 3, pendingCount: 0 })
    ).toBe('ready')
  })

  it('treats pending-only cards as content', () => {
    expect(
      sectionListState({ status: 'idle', hasError: false, itemCount: 0, pendingCount: 1 })
    ).toBe('ready')
  })
})
