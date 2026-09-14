import { createHash } from 'node:crypto'
import { validateUrl } from '../url-validator'

export interface ClipboardCapturePipelineOptions {
  onCapture: (url: string) => void
  debounceMs?: number
  hash?: (value: string) => string
}

export const DEFAULT_DEBOUNCE_MS = 300

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Turns raw clipboard text into capture callbacks: session-level dedupe,
 * URL validation and a debounce that keeps only the most recent candidate.
 */
export class ClipboardCapturePipeline {
  private lastHash: string | null = null
  private pending: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  private readonly debounceMs: number
  private readonly hash: (value: string) => string
  private readonly onCapture: (url: string) => void

  constructor(options: ClipboardCapturePipelineOptions) {
    this.onCapture = options.onCapture
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
    this.hash = options.hash ?? sha256
  }

  handle(text: string): void {
    const hash = this.hash(text)
    if (hash === this.lastHash) return
    this.lastHash = hash

    const validation = validateUrl(text)
    if (!validation.valid) return

    this.pending = validation.url
    if (this.timer !== null) clearTimeout(this.timer)

    this.timer = setTimeout(() => {
      this.timer = null
      const url = this.pending
      this.pending = null
      if (url) this.onCapture(url)
    }, this.debounceMs)
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
