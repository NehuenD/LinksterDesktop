import { describe, expect, it } from 'vitest'
import { parseBookmarksHtml } from '../../src/main/services/bookmarks-html-parser'

const HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3>Bookmarks bar</H3>
  <DL><p>
    <DT><A HREF="https://example.com/a">Example &amp; Co</A>
    <DT><H3>Nested</H3>
    <DL><p>
      <DT><A HREF="https://example.com/b">B</A>
    </DL><p>
  </DL><p>
</DL><p>`

describe('parseBookmarksHtml', () => {
  it('emits anchors in order with their nearest folder as the folder path', () => {
    const entries = parseBookmarksHtml(HTML)
    expect(entries.map((entry) => entry.url)).toEqual([
      'https://example.com/a',
      'https://example.com/b'
    ])
    expect(entries[0]).toMatchObject({
      title: 'Example & Co',
      folderPath: ['Bookmarks bar']
    })
    expect(entries[1].folderPath).toEqual(['Bookmarks bar', 'Nested'])
  })

  it('accepts single-quoted hrefs and strips nested markup from titles', () => {
    const entries = parseBookmarksHtml(`<DL><DT><A HREF='https://x.test'><b>Bold</b> title</A></DL>`)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ url: 'https://x.test', title: 'Bold title' })
  })

  it('falls back to the url when an anchor title is empty', () => {
    const entries = parseBookmarksHtml(`<DL><DT><A HREF="https://x.test"></A></DL>`)
    expect(entries[0].title).toBe('https://x.test')
  })

  it('returns nothing for malformed input without anchors', () => {
    expect(parseBookmarksHtml('<html><body>not bookmarks</body></html>')).toEqual([])
  })
})
