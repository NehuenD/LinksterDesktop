export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 45) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  if (seconds < 2_629_746) return `${Math.floor(seconds / 604800)}w ago`
  if (seconds < 31_556_952) return `${Math.floor(seconds / 2_629_746)}mo ago`
  return `${Math.floor(seconds / 31_556_952)}y ago`
}

export const WORDS_PER_MINUTE = 225

export function readingTimeMinutes(wordCount: number | null | undefined): number | null {
  if (wordCount === null || wordCount === undefined || wordCount <= 0) return null
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE))
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Absolute short date (e.g. "Mar 21, 2006"); empty for invalid input. */
export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  })
}

/** Video duration as m:ss / h:mm:ss; null when unknown or non-positive. */
export function formatDuration(
  seconds: number | null | undefined
): string | null {
  if (seconds === null || seconds === undefined || seconds <= 0) return null
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (value: number): string => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`
}
