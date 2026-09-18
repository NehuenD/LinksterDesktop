import { describe, expect, it } from 'vitest'
import { toQuickCaptureOutcome } from '../../src/main/services/quick-capture-outcome'

describe('toQuickCaptureOutcome', () => {
  it('reports an already-queued capture as pending', () => {
    expect(
      toQuickCaptureOutcome({
        decision: { accepted: true, alreadyPending: true },
        persisted: false,
        label: 'Reading'
      })
    ).toEqual({ outcome: 'pending', message: 'Already queued — it will sync automatically.' })
  })

  it('reports a persisted capture as saved', () => {
    expect(
      toQuickCaptureOutcome({
        decision: { accepted: true, alreadyPending: false },
        persisted: true,
        label: 'Reading'
      })
    ).toEqual({ outcome: 'saved', label: 'Reading' })
  })

  it('reports an enqueued-but-unsynced capture as queued', () => {
    expect(
      toQuickCaptureOutcome({
        decision: { accepted: true, alreadyPending: false },
        persisted: false,
        label: 'Reading'
      })
    ).toEqual({ outcome: 'queued', label: 'Reading' })
  })

  it('reports a server duplicate', () => {
    expect(
      toQuickCaptureOutcome({
        decision: { accepted: false, code: 'duplicate', reason: 'duplicate' },
        persisted: false,
        label: 'Reading'
      })
    ).toEqual({ outcome: 'duplicate', message: 'Already in your library.' })
  })

  it('reports an invalid URL with the validator reason', () => {
    expect(
      toQuickCaptureOutcome({
        decision: {
          accepted: false,
          code: 'invalid',
          reason: 'Only http and https URLs are supported.'
        },
        persisted: false,
        label: 'Reading'
      })
    ).toEqual({ outcome: 'invalid', message: 'Only http and https URLs are supported.' })
  })
})
