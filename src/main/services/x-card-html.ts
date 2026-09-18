export interface FallbackCardInput {
  authorName: string | null
  authorHandle: string | null
  text: string | null
  postedAt: string | null
  url: string
  relatedUrl?: string | null
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

export function formatPostDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Self-contained fallback card used when the official embed cannot render.
 * Inline styles only, no scripts, and every field is escaped: the string is
 * loaded into an isolated window and screenshotted.
 */
export function buildFallbackCardHtml(input: FallbackCardInput): string {
  const author = input.authorName ?? 'X post'
  const handle = input.authorHandle ? `@${input.authorHandle}` : null
  const date = formatPostDate(input.postedAt)
  const text = escapeHtml(input.text ?? '(no text captured)').replace(/\n/g, '<br>')
  const related = input.relatedUrl
    ? `<p class="related">Contains link → ${escapeHtml(input.relatedUrl)}</p>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #ffffff;
    color: #0f1419;
    padding: 18px;
  }
  article {
    border: 1px solid #e1e8ed;
    border-radius: 14px;
    padding: 16px;
    max-width: 550px;
  }
  header { font-size: 14px; margin-bottom: 8px; }
  .author { font-weight: 700; }
  .handle, time { color: #536471; font-weight: 400; }
  .text { font-size: 17px; line-height: 1.45; white-space: normal; }
  .related {
    margin-top: 12px;
    padding: 8px 10px;
    border: 1px solid #cfd9de;
    border-radius: 10px;
    font-size: 13px;
    color: #0f1419;
    word-break: break-all;
  }
  .url { margin-top: 12px; font-size: 12px; color: #536471; word-break: break-all; }
</style>
</head>
<body>
<article>
  <header>
    <span class="author">${escapeHtml(author)}</span>
    ${handle ? `<span class="handle">${escapeHtml(handle)}</span>` : ''}
    ${date ? `<time>· ${escapeHtml(date)}</time>` : ''}
  </header>
  <p class="text">${text}</p>
  ${related}
  <p class="url">${escapeHtml(input.url)}</p>
</article>
</body>
</html>`
}
