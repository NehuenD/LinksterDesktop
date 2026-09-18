import { DEFAULT_USER_AGENT, readCappedText } from './http-read'
import { X_OEMBED_ENDPOINTS, parseXOEmbed, type XPostData } from './x-embed'
import { assertPublicHost } from './url-validator'

const TIMEOUT_MS = 15_000
const MAX_BYTES = 256 * 1024
const USER_AGENT = DEFAULT_USER_AGENT

export interface XOEmbedDeps {
  fetch: typeof fetch
  timeoutMs: number
  maxBytes: number
  userAgent: string
  isHostAllowed: (host: string) => Promise<boolean>
}

export function resolveXOEmbedDeps(overrides: Partial<XOEmbedDeps> = {}): XOEmbedDeps {
  return {
    fetch: overrides.fetch ?? fetch,
    timeoutMs: overrides.timeoutMs ?? TIMEOUT_MS,
    maxBytes: overrides.maxBytes ?? MAX_BYTES,
    userAgent: overrides.userAgent ?? USER_AGENT,
    isHostAllowed: overrides.isHostAllowed ?? assertPublicHost
  }
}

/**
 * Fetches tweet metadata from X's oEmbed endpoint. Endpoints are tried in
 * order; any failure (network, non-JSON, host not allowed) falls through to the
 * next so a single endpoint outage does not lose the capture metadata.
 */
export async function fetchXOEmbed(
  tweetId: string,
  tweetUrl: string,
  overrides: Partial<XOEmbedDeps> = {}
): Promise<XPostData | null> {
  const deps = resolveXOEmbedDeps(overrides)

  for (const endpoint of X_OEMBED_ENDPOINTS) {
    let host: string
    try {
      host = new URL(endpoint).hostname
    } catch {
      continue
    }
    if (!(await deps.isHostAllowed(host))) continue

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs)
    try {
      const url = `${endpoint}?url=${encodeURIComponent(tweetUrl)}&omit_script=1&dnt=true`
      const response = await deps.fetch(url, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { accept: 'application/json', 'user-agent': deps.userAgent }
      })
      // Endpoints are fixed and must answer directly; a redirect could target
      // an internal host, so it is treated as a failure.
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined)
        continue
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        continue
      }

      const text = await readCappedText(response, deps.maxBytes)
      const post = parseXOEmbed(tweetId, JSON.parse(text))
      if (post) return post
    } catch {
      // Try the next endpoint.
    } finally {
      clearTimeout(timer)
    }
  }

  return null
}
