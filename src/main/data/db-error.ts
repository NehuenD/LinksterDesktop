export class DatabaseError extends Error {
  readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'DatabaseError'
    this.code = code
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === '23505'
}

const MAX_MESSAGE_LENGTH = 300
const HTML_TITLE_PATTERN = /<title[^>]*>([^<]*)<\/title>/i
const HTML_HINT_PATTERN = /^\s*</
const HTML_TAG_PATTERN = /<(!doctype|html|head|body|title|p|div|span|script|style)\b/i
const FALLBACK_MESSAGE = 'The database request failed.'
const HTML_FALLBACK_MESSAGE = 'Server request failed (unexpected HTML response).'

export interface DbErrorLike {
  message?: string | null
}

function looksLikeHtml(value: string): boolean {
  return HTML_HINT_PATTERN.test(value) || HTML_TAG_PATTERN.test(value)
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function cap(value: string): string {
  return value.length > MAX_MESSAGE_LENGTH
    ? `${value.slice(0, MAX_MESSAGE_LENGTH - 1).trimEnd()}…`
    : value
}

/**
 * PostgREST errors normally carry a short database message, but a gateway
 * outage (e.g. Cloudflare 522) returns a full HTML page as the body and the
 * client surfaces it as `error.message`. Never let that reach the UI: keep
 * short messages as-is and collapse HTML pages to their title (or a generic
 * message), capped so no error can flood the interface.
 */
export function dbErrorMessage(error: DbErrorLike | null | undefined): string {
  const raw = collapse(error?.message ?? '')
  if (raw.length === 0) return FALLBACK_MESSAGE
  if (!looksLikeHtml(raw)) return cap(raw)

  const title = collapse(raw.match(HTML_TITLE_PATTERN)?.[1] ?? '')
  return title.length > 0 ? cap(`Server request failed: ${title}`) : HTML_FALLBACK_MESSAGE
}
