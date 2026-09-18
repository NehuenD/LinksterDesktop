/**
 * Tolerant parser for the Netscape bookmark HTML format exported by
 * Chrome, Edge, and Firefox. The markup is loosely structured (optional and
 * unclosed `<DT>`/`<p>` tags), so we scan tokens in document order and track
 * folder nesting with an explicit stack instead of a strict DOM parse.
 */

export interface BookmarkEntry {
  title: string
  url: string
  folderPath: string[]
}

const TOKEN_RE =
  /<dl\b[^>]*>|<\/dl\s*>|<h3\b[^>]*>([\s\S]*?)<\/h3\s*>|<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
}

function clean(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseBookmarksHtml(html: string): BookmarkEntry[] {
  const entries: BookmarkEntry[] = []
  const stack: string[] = []
  let pendingFolder: string | null = null

  for (const match of html.matchAll(TOKEN_RE)) {
    const token = match[0]

    if (/^<dl\b/i.test(token)) {
      stack.push(pendingFolder ?? '')
      pendingFolder = null
      continue
    }

    if (/^<\/dl/i.test(token)) {
      stack.pop()
      continue
    }

    if (/^<h3\b/i.test(token)) {
      pendingFolder = clean(match[1] ?? '')
      continue
    }

    const href = (match[2] ?? match[3] ?? '').trim()
    if (href.length === 0) continue

    const folderPath = stack.filter((name) => name.length > 0)
    entries.push({ title: clean(match[4] ?? '') || href, url: href, folderPath })
  }

  return entries
}
