import { createHash } from 'node:crypto'
import { validateUrl } from '../url-validator'

export type CaptureOutcome = { accepted: boolean; retryable: boolean }

export interface ClipboardCapturePipelineOptions {
  onCapture: (url: string) => CaptureOutcome | void | Promise<CaptureOutcome | void>
  debounceMs?: number
  hash?: (value: string) => string
}

interface PendingCandidate {
  url: string
  hash: string
}

export const DEFAULT_DEBOUNCE_MS = 300

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Turns raw clipboard text into capture callbacks: session-level dedupe,
 * URL validation and a debounce that keeps only the most recent candidate.
 *
 * The session hash suppresses a re-capture only once the capture is accepted
 * (persisted or durably queued). A retryable failure clears it so re-copying
 * the same URL can be re-attempted instead of locking out for the session.
 */
export class ClipboardCapturePipeline {
  private lastHash: string | null = null
  private pending: PendingCandidate | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  private readonly debounceMs: number
  private readonly hash: (value: string) => string
  private readonly onCapture: (url: string) => CaptureOutcome | void | Promise<CaptureOutcome | void>

  constructor(options: ClipboardCapturePipelineOptions) {
    this.onCapture = options.onCapture
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
    this.hash = options.hash ?? sha256
  }

  handle(text: string): void {
    const hash = this.hash(text)
    if (hash === this.lastHash) return

    const validation = validateUrl(text)
    if (!validation.valid) return

    this.pending = { url: validation.url, hash }
    if (this.timer !== null) clearTimeout(this.timer)

    this.timer = setTimeout(() => {
      void this.emit()
    }, this.debounceMs)
  }

  private async emit(): Promise<void> {
    this.timer = null
    const pending = this.pending
    this.pending = null
    if (!pending) return

    let outcome: CaptureOutcome | void
    try {
      outcome = await this.onCapture(pending.url)
    } catch {
      outcome = { accepted: false, retryable: true }
    }

    const result = outcome ?? { accepted: true, retryable: false }
    this.lastHash = result.accepted || !result.retryable ? pending.hash : null
  }

  reset(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pending = null
    this.lastHash = null
  }
}
