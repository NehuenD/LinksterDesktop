import { emptyMetadata, parseMetadata, type LinkMetadata } from './metadata-parser'
import { validateUrl } from './url-validator'

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 15_000
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export interface MetadataDeps {
  fetch: typeof fetch
  timeoutMs: number
  maxBytes: number
  userAgent: string
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const body = response.body
  const reader = body?.getReader?.()
  if (!reader) {
    return (await response.text()).slice(0, maxBytes)
  }

  const chunks: Uint8Array[] = []
  let total = 0

  while (total < maxBytes) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      total += value.byteLength
    }
  }

  const limited = new Uint8Array(Math.min(total, maxBytes))
  let offset = 0
  for (const chunk of chunks) {
    const remaining = limited.length - offset
    if (remaining <= 0) break
    const slice = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk
    limited.set(slice, offset)
    offset += slice.byteLength
  }

  return new TextDecoder().decode(limited)
}

export async function fetchMetadata(
  rawUrl: string,
  overrides: Partial<MetadataDeps> = {}
): Promise<LinkMetadata> {
  const deps: MetadataDeps = {
    fetch: overrides.fetch ?? fetch,
    timeoutMs: overrides.timeoutMs ?? TIMEOUT_MS,
    maxBytes: overrides.maxBytes ?? MAX_BYTES,
    userAgent: overrides.userAgent ?? USER_AGENT
  }

  const validation = validateUrl(rawUrl)
  const url = validation.valid ? validation.url : rawUrl

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs)

  try {
    const response = await deps.fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': deps.userAgent,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    })

    if (!response.ok) return emptyMetadata()

    const contentType = response.headers.get('content-type') ?? ''
    if (
      contentType.length > 0 &&
      !contentType.includes('text/html') &&
      !contentType.includes('application/xhtml')
    ) {
      return emptyMetadata()
    }

    const html = await readCapped(response, deps.maxBytes)
    return parseMetadata(html, url)
  } catch {
    return emptyMetadata()
  } finally {
    clearTimeout(timer)
  }
}
