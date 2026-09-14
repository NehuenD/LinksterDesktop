const MAX_URL_LENGTH = 500

export type UrlValidationResult =
  | { valid: true; url: string }
  | { valid: false; reason: string }

const PRIVATE_IPV4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./
]

function hasScheme(input: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
}

function looksLikeHost(input: string): boolean {
  return /^[^\s/?#]+\.[^\s/?#]+/.test(input)
}

function isPrivateIpv4(host: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false
  return PRIVATE_IPV4.some((pattern) => pattern.test(host))
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (normalized === '::1' || normalized === '::') return true
  const firstGroup = normalized.split(':')[0]
  if (firstGroup.startsWith('fe8') || firstGroup.startsWith('fe9')) return true
  if (firstGroup.startsWith('fea') || firstGroup.startsWith('feb')) return true
  if (firstGroup.startsWith('fc') || firstGroup.startsWith('fd')) return true
  return false
}

export function isPrivateHost(host: string): boolean {
  const normalized = host.toLowerCase()
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local')
  ) {
    return true
  }
  if (normalized.includes(':')) return isPrivateIpv6(normalized)
  return isPrivateIpv4(normalized)
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function validateUrl(raw: string): UrlValidationResult {
  const trimmed = raw.trim()

  if (trimmed.length === 0) return { valid: false, reason: 'URL is empty.' }
  if (trimmed.length > MAX_URL_LENGTH) return { valid: false, reason: 'URL is too long.' }
  if (hasControlCharacters(trimmed)) {
    return { valid: false, reason: 'URL contains control characters.' }
  }

  const candidate = hasScheme(trimmed)
    ? trimmed
    : looksLikeHost(trimmed)
      ? `https://${trimmed}`
      : trimmed

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return { valid: false, reason: 'URL is not valid.' }
  }

  const protocol = parsed.protocol.toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:') {
    return { valid: false, reason: 'Only http and https URLs are supported.' }
  }

  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return { valid: false, reason: 'URLs with embedded credentials are not supported.' }
  }

  const host = parsed.hostname.toLowerCase()
  if (host.length === 0) return { valid: false, reason: 'URL has no host.' }
  if (isPrivateHost(host)) {
    return { valid: false, reason: 'Local and private addresses are not supported.' }
  }

  return { valid: true, url: parsed.toString() }
}
