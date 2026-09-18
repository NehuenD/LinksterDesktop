import type { QuickCaptureOutcome } from '@shared/contract/ipc'

export type QuickCaptureDecision =
  | { accepted: true; alreadyPending: boolean }
  | { accepted: false; code: 'invalid' | 'duplicate' | 'unauthenticated'; reason: string }

export interface QuickCaptureResolution {
  decision: QuickCaptureDecision
  /** True when the drained item left the outbox (i.e. it reached Supabase). */
  persisted: boolean
  label: string
}

/** Pure mapping from a capture decision to the message the overlay shows. */
export function toQuickCaptureOutcome({
  decision,
  persisted,
  label
}: QuickCaptureResolution): QuickCaptureOutcome {
  if (!decision.accepted) {
    return decision.code === 'duplicate'
      ? { outcome: 'duplicate', message: 'Already in your library.' }
      : { outcome: 'invalid', message: decision.reason }
  }

  if (decision.alreadyPending) {
    return { outcome: 'pending', message: 'Already queued — it will sync automatically.' }
  }

  return persisted ? { outcome: 'saved', label } : { outcome: 'queued', label }
}
