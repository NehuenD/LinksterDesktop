/** Rendering state of an isolated section's list area. */
export type SectionListState = 'loading' | 'error' | 'empty' | 'ready'

export interface SectionListInput {
  status: 'idle' | 'loading' | 'error'
  hasError: boolean
  itemCount: number
  pendingCount: number
}

/**
 * One state for the list area so error and empty never render together: a
 * failed first load shows the error (never "nothing saved"), while a partial
 * failure with content on screen keeps rendering the list next to the banner.
 */
export function sectionListState(input: SectionListInput): SectionListState {
  const totalItems = input.itemCount + input.pendingCount
  if (totalItems === 0) {
    if (input.hasError) return 'error'
    if (input.status === 'loading') return 'loading'
    return 'empty'
  }
  return 'ready'
}
