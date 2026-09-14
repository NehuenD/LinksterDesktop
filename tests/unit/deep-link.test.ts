import { describe, expect, it } from 'vitest'
import { findDeepLink, parseAuthCallback } from '../../src/main/auth/deep-link'

describe('findDeepLink', () => {
  it('finds the protocol url among arguments', () => {
    expect(findDeepLink(['--flag', 'linkster://auth/callback?code=abc'])).toBe(
      'linkster://auth/callback?code=abc'
    )
  })

  it('returns null when no deep link is present', () => {
    expect(findDeepLink(['--flag', 'value'])).toBeNull()
  })
})

describe('parseAuthCallback', () => {
  it('extracts the authorization code', () => {
    expect(parseAuthCallback('linkster://auth/callback?code=abc123')).toEqual({
      code: 'abc123',
      error: null
    })
  })

  it('extracts an error description', () => {
    const result = parseAuthCallback(
      'linkster://auth/callback?error=access_denied&error_description=Denied'
    )
    expect(result.error).toBe('Denied')
    expect(result.code).toBeNull()
  })

  it('rejects foreign protocols and unrelated paths', () => {
    expect(parseAuthCallback('https://example.com/auth/callback?code=abc')).toEqual({
      code: null,
      error: null
    })
    expect(parseAuthCallback('linkster://other/path?code=abc')).toEqual({
      code: null,
      error: null
    })
  })

  it('handles null and malformed input', () => {
    expect(parseAuthCallback(null)).toEqual({ code: null, error: null })
    expect(parseAuthCallback('not a url')).toEqual({ code: null, error: null })
  })
})
