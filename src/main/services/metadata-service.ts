import { parse } from 'node-html-parser'
import { extractContent, type ExtractedContent } from './content-extractor'
import { DEFAULT_USER_AGENT, readCappedText } from './http-read'
import { emptyMetadata, parseMetadataFromRoot, type LinkMetadata } from './metadata-parser'
import { assertPublicHost, validateUrl } from './url-validator'

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 5
const USER_AGENT = DEFAULT_USER_AGENT

export interface MetadataDeps {
  fetch: typeof fetch
  timeoutMs: number
  maxBytes: number
  userAgent: string
  isHostAllowed: (host: string) => Promise<boolean>
}

export interface PageData {
  metadata: LinkMetadata
  finalUrl: string
  content: ExtractedContent | null
  /**
   * True when the page could not be fetched at all (network/timeout/blocked):
   * callers must treat this as retryable rather than "page has no article".
   */
  fetchFailed: boolean
}

export function resolveDeps(overrides: Partial<MetadataDeps>): MetadataDeps {
  return {
    fetch: overrides.fetch ?? fetch,
    timeoutMs: overrides.timeoutMs ?? TIMEOUT_MS,
    maxBytes: overrides.maxBytes ?? MAX_BYTES,
    userAgent: overrides.userAgent ?? USER_AGENT,
    isHostAllowed: overrides.isHostAllowed ?? assertPublicHost
  }
}

interface FetchOutcome {
  response: Response
  finalUrl: string
}

/**
 * Follows redirects manually so every hop is re-validated against the SSRF
 * policy before the next request is issued. Returns null when a hop is private,
 * malformed, or exceeds the redirect budget.
 */
async function followRedirects(
  initialUrl: string,
  deps: MetadataDeps,
  signal: AbortSignal
): Promise<FetchOutcome | null> {
  let current = initialUrl

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let host: string
    try {
      host = new URL(current).hostname
    } catch {
      return null
    }

    if (!(await deps.isHostAllowed(host))) return null

    const response = await deps.fetch(current, {
      redirect: 'manual',
      signal,
      headers: {
        'user-agent': deps.userAgent,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return null
      let next: string
      try {
        next = new URL(location, current).toString()
      } catch {
        return null
      }
      const validation = validateUrl(next)
      if (!validation.valid) return null
      current = validation.url
      continue
    }

    return { response, finalUrl: current }
  }

  return null
}

/**
 * Fetches a page once and derives everything the capture pipeline needs. Kept
 * as the single outbound-HTML seam so metadata and reader content share one
 * network request and one SSRF policy.
 */
export async function fetchPageData(
  rawUrl: string,
  overrides: Partial<MetadataDeps> = {}
): Promise<PageData> {
  const deps = resolveDeps(overrides)

  const validation = validateUrl(rawUrl)
  const url = validation.valid ? validation.url : rawUrl

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs)

  try {
    const outcome = await followRedirects(url, deps, controller.signal)
    if (!outcome) {
      return { metadata: emptyMetadata(), finalUrl: url, content: null, fetchFailed: true }
    }

    const { response, finalUrl } = outcome
    if (!response.ok) {
      return { metadata: emptyMetadata(), finalUrl, content: null, fetchFailed: false }
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (
      contentType.length > 0 &&
      !contentType.includes('text/html') &&
      !contentType.includes('application/xhtml')
    ) {
      return { metadata: emptyMetadata(), finalUrl, content: null, fetchFailed: false }
    }

    const html = await readCappedText(response, deps.maxBytes)
    try {
      const root = parse(html)
      const metadata = parseMetadataFromRoot(root, finalUrl)
      return {
        metadata,
        finalUrl,
        content: extractContent(root, finalUrl, metadata),
        fetchFailed: false
      }
    } catch {
      return { metadata: emptyMetadata(), finalUrl, content: null, fetchFailed: false }
    }
  } catch {
    return { metadata: emptyMetadata(), finalUrl: url, content: null, fetchFailed: true }
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchMetadata(
  rawUrl: string,
  overrides: Partial<MetadataDeps> = {}
): Promise<LinkMetadata> {
  return (await fetchPageData(rawUrl, overrides)).metadata
}
