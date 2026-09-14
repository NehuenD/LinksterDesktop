/**
 * Client-side URL normalization. The database trigger
 * (`linkster_normalize_url`) is authoritative for stored dedup keys; this
 * mirrors the same rules so the client can pre-check before inserting.
 */

const TRACKING_PATTERNS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^dclid$/i,
  /^mc_eid$/i,
  /^mc_cid$/i,
  /^igshid$/i
]

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return trimmed

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return trimmed
  }

  parsed.hash = ''
  parsed.protocol = parsed.protocol.toLowerCase()
  parsed.hostname = parsed.hostname.toLowerCase()

  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PATTERNS.some((pattern) => pattern.test(key))) {
      parsed.searchParams.delete(key)
    }
  }

  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  }

  const result = parsed.toString()
  return result.endsWith('/') ? result.slice(0, -1) : result
}
