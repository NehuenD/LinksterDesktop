import { describe, expect, it } from 'vitest'
import { dbErrorMessage } from '../../src/main/data/db-error'

export const CLOUDFLARE_522 =
  '<!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]--> <html class="no-js" lang="en-US"> <head> <title>supabase.co | 522: Connection timed out</title> </head> <body> <h1>Connection timed out</h1> <p>Error code 522</p> </body> </html>'

describe('dbErrorMessage', () => {
  it('collapses a gateway HTML page into a short server message', () => {
    expect(dbErrorMessage({ message: CLOUDFLARE_522 })).toBe(
      'Server request failed: supabase.co | 522: Connection timed out'
    )
  })

  it('falls back to a generic message for HTML without a title', () => {
    expect(dbErrorMessage({ message: '<html><body>oops</body></html>' })).toBe(
      'Server request failed (unexpected HTML response).'
    )
  })

  it('keeps short database messages as-is', () => {
    expect(dbErrorMessage({ message: 'duplicate key value violates unique constraint' })).toBe(
      'duplicate key value violates unique constraint'
    )
  })

  it('caps long messages instead of dumping the whole payload', () => {
    const message = dbErrorMessage({ message: 'x'.repeat(1000) })
    expect(message.length).toBe(300)
    expect(message.endsWith('…')).toBe(true)
  })

  it('handles missing messages', () => {
    expect(dbErrorMessage(null)).toBe('The database request failed.')
    expect(dbErrorMessage({ message: '' })).toBe('The database request failed.')
    expect(dbErrorMessage({ message: '   ' })).toBe('The database request failed.')
  })
})
