import { lookup } from 'node:dns/promises'

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
  /^0\./,
  // CGNAT 100.64.0.0/10
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  // IETF protocol assignments / TEST-NETs / benchmarking
  /^192\.0\.0\./,
  /^192\.0\.2\./,
  /^198\.18\./,
  /^198\.19\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
  // multicast (224/4) and reserved (240/4) incl. 255.255.255.255
  /^22[4-9]\./,
  /^23\d\./,
  /^24\d\./,
  /^25[0-5]\./
]

// `C:\...`/`C:/...` and `\\server\share` are filesystem paths, not hosts. Without
// this guard the host heuristic rewrites them to `https://c/...` and captures a
// bogus link (e.g. re-capturing a screenshot path copied from the media view).
const WINDOWS_ABSOLUTE_PATH = /^[a-z]:[\\/]/i
const UNC_PATH = /^\\\\/

/**
 * Shared http(s)-only check for values handed to `shell.openExternal` or opened
 * from window-open/navigation requests. Blocks `file:`, custom schemes, and
 * control-character smuggling.
 */
export function isSafeExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed.length === 0 || hasControlCharacters(trimmed)) return false
  return /^https?:\/\//i.test(trimmed)
}

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

/** Expands an IPv6 literal into eight 16-bit groups; null when unparseable. */
function parseIpv6Groups(host: string): number[] | null {
  let normalized = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (normalized.includes('%')) normalized = normalized.split('%')[0] ?? normalized

  // `new URL` may leave a dotted quad form (::ffff:127.0.0.1); fold it into
  // two hex groups so one code path classifies every representation.
  const embedded = normalized.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (embedded) {
    const octets = embedded[1].split('.').map(Number)
    if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
      return null
    }
    const high = ((octets[0] << 8) | octets[1]).toString(16)
    const low = ((octets[2] << 8) | octets[3]).toString(16)
    normalized = `${normalized.slice(0, normalized.length - embedded[1].length)}${high}:${low}`
  }

  const halves = normalized.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  let groups: string[]
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length
    if (missing < 0) return null
    groups = [...head, ...new Array<string>(missing).fill('0'), ...tail]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null

  const parsed: number[] = []
  for (const group of groups) {
    if (group.length === 0 || group.length > 4 || !/^[0-9a-f]+$/.test(group)) return null
    parsed.push(Number.parseInt(group, 16))
  }
  return parsed
}

function embeddedIpv4IsPrivate(groups: readonly number[]): boolean {
  return isPrivateIpv4(
    `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`
  )
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (normalized === '::1' || normalized === '::') return true
  // IPv4-mapped/compatible (::ffff:a.b.c.d, ::a.b.c.d), NAT64, 6to4.
  const mapped = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (mapped) return isPrivateIpv4(mapped[1])
  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16)
    const low = Number.parseInt(mappedHex[2], 16)
    return isPrivateIpv4(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`)
  }

  const groups = parseIpv6Groups(normalized)
  if (!groups) return false

  // ::/96 IPv4-compatible (covers ::169.254.169.254 and ::127.0.0.1 forms).
  if (groups.slice(0, 6).every((value) => value === 0)) {
    return embeddedIpv4IsPrivate(groups)
  }
  // 64:ff9b::/96 NAT64.
  if (
    groups[0] === 0x64 &&
    groups[1] === 0xff9b &&
    groups.slice(2, 6).every((value) => value === 0)
  ) {
    return embeddedIpv4IsPrivate(groups)
  }
  // 2002::/16 6to4 embeds the IPv4 address in groups 1/2.
  if (groups[0] === 0x2002) {
    return isPrivateIpv4(
      `${groups[1] >> 8}.${groups[1] & 0xff}.${groups[2] >> 8}.${groups[2] & 0xff}`
    )
  }
  // fe80::/10 link-local and fec0::/10 site-local.
  if ((groups[0] & 0xffc0) === 0xfe80 || (groups[0] & 0xffc0) === 0xfec0) return true
  // fc00::/7 unique-local.
  if ((groups[0] & 0xfe00) === 0xfc00) return true
  // ff00::/8 multicast.
  if ((groups[0] & 0xff00) === 0xff00) return true
  // 2001:db8::/32 documentation.
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true
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
  if (WINDOWS_ABSOLUTE_PATH.test(trimmed) || UNC_PATH.test(trimmed)) {
    return { valid: false, reason: 'Local file paths are not supported.' }
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

const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/

export type AddressLookup = (host: string) => Promise<string[]>

const defaultLookup: AddressLookup = async (host) => {
  const results = await lookup(host, { all: true })
  return results.map((entry) => entry.address)
}

/**
 * Defends the outbound fetch path against SSRF: literal hosts are checked
 * synchronously, and DNS is resolved so a public hostname that points at a
 * private/reserved address (or a redirect to one) is refused before any request.
 */
export async function assertPublicHost(
  host: string,
  addressLookup: AddressLookup = defaultLookup
): Promise<boolean> {
  const normalized = host.toLowerCase()
  if (isPrivateHost(normalized)) return false
  if (IPV4_LITERAL.test(normalized) || normalized.includes(':')) return true

  try {
    const addresses = await addressLookup(normalized)
    if (addresses.length === 0) return false
    return addresses.every((address) => !isPrivateHost(address))
  } catch {
    return false
  }
}
