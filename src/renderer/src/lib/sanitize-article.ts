const ALLOWED_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'em',
  'strong',
  'b',
  'i',
  'a',
  'img',
  'figure',
  'figcaption',
  'hr',
  'br',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'sup',
  'sub'
])

const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan'])

const DROP_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'svg',
  'canvas',
  'template',
  'noscript'
])

function unwrap(element: Element): void {
  const parent = element.parentNode
  if (!parent) return
  while (element.firstChild) parent.insertBefore(element.firstChild, element)
  element.remove()
}

function cleanAttributes(element: Element): void {
  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase()
    if (!ALLOWED_ATTRS.has(name)) {
      element.removeAttribute(attr.name)
      continue
    }
    if (name === 'href' || name === 'src') {
      if (!/^https?:\/\//i.test(attr.value.trim())) element.removeAttribute(attr.name)
    }
  }
  if (element.tagName.toLowerCase() === 'a') {
    element.setAttribute('rel', 'noreferrer noopener')
    element.setAttribute('target', '_blank')
  }
}

function scrub(element: Element): void {
  let child = element.firstElementChild
  while (child) {
    const next = child.nextElementSibling
    const tag = child.tagName.toLowerCase()

    if (DROP_TAGS.has(tag)) {
      child.remove()
    } else if (!ALLOWED_TAGS.has(tag)) {
      scrub(child)
      unwrap(child)
    } else {
      cleanAttributes(child)
      scrub(child)
    }

    child = next
  }
}

/**
 * Render-time defense in depth: article HTML is already sanitized in the main
 * process, but it is scrubbed again against a strict allowlist before it is
 * injected into the DOM.
 */
export function sanitizeArticleHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const container = doc.getElementById('root')
  if (!container) return ''
  scrub(container)
  return container.innerHTML
}
