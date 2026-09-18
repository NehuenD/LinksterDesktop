/**
 * Shared browser UA for outbound fetches. Origin UI code treats a browser UA
 * better than a bot UA, matching what the metadata fetcher has always used.
 */
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Reads a response body up to a byte cap without buffering the whole payload.
 * Shared by every outbound HTML/JSON fetch so a hostile or oversized response
 * cannot exhaust memory.
 */
export async function readCappedText(response: Response, maxBytes: number): Promise<string> {
  const body = response.body
  const reader = body?.getReader?.()
  if (!reader) {
    return (await response.text()).slice(0, maxBytes)
  }

  const chunks: Uint8Array[] = []
  let total = 0
  let reachedEnd = false

  try {
    while (total < maxBytes) {
      const { value, done } = await reader.read()
      if (done) {
        reachedEnd = true
        break
      }
      if (value) {
        chunks.push(value)
        total += value.byteLength
      }
    }
  } finally {
    // Hitting the cap leaves the body unread; cancel it so the socket is
    // released instead of being held until GC.
    if (!reachedEnd) {
      try {
        await reader.cancel()
      } catch {
        // Cancellation is best-effort.
      }
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
