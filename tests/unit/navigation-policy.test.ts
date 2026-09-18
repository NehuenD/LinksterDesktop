import { describe, expect, it } from 'vitest'
import { isAllowedNavigation } from '../../src/main/windows/navigation-policy'

describe('isAllowedNavigation', () => {
  it('allows same-origin navigation in the dev (http) renderer', () => {
    expect(
      isAllowedNavigation(
        'http://localhost:5173/quick-capture.html',
        'http://localhost:5173/index.html'
      )
    ).toBe(true)
  })

  it('blocks other origins in dev', () => {
    expect(
      isAllowedNavigation('https://evil.example/', 'http://localhost:5173/index.html')
    ).toBe(false)
  })

  it('allows only the exact entry file in production', () => {
    const appUrl = 'file:///app/out/renderer/index.html'
    expect(isAllowedNavigation(appUrl, appUrl)).toBe(true)
    expect(isAllowedNavigation('file:///etc/passwd', appUrl)).toBe(false)
    expect(isAllowedNavigation('https://example.com', appUrl)).toBe(false)
  })

  it('rejects malformed targets', () => {
    expect(isAllowedNavigation('not a url', 'http://localhost:5173/index.html')).toBe(false)
  })
})
