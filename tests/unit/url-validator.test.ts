import { describe, expect, it } from 'vitest'
import { isPrivateHost, validateUrl } from '../../src/main/services/url-validator'

describe('validateUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(validateUrl('https://example.com/a?b=1')).toEqual({
      valid: true,
      url: 'https://example.com/a?b=1'
    })
  })

  it('prepends https to scheme-less hosts', () => {
    const result = validateUrl('example.com')
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.url).toBe('https://example.com/')
  })

  it('rejects non-http schemes', () => {
    expect(validateUrl('javascript:alert(1)').valid).toBe(false)
    expect(validateUrl('ftp://example.com').valid).toBe(false)
  })

  it('rejects empty, oversized and control-character input', () => {
    expect(validateUrl('   ').valid).toBe(false)
    expect(validateUrl(`https://example.com/${'a'.repeat(600)}`).valid).toBe(false)
    expect(validateUrl('https://exa\u0000mple.com').valid).toBe(false)
  })

  it('rejects embedded credentials', () => {
    expect(validateUrl('https://user:pass@example.com').valid).toBe(false)
  })

  it('rejects private and loopback hosts', () => {
    const hosts = [
      'localhost',
      '127.0.0.1',
      '10.0.0.5',
      '192.168.1.1',
      '172.16.0.1',
      '169.254.1.1',
      'printer.local'
    ]
    for (const host of hosts) {
      expect(validateUrl(`http://${host}`).valid).toBe(false)
    }
  })

  it('rejects IPv6 loopback and unique-local addresses', () => {
    expect(validateUrl('http://[::1]/').valid).toBe(false)
    expect(validateUrl('http://[fd00::1]/').valid).toBe(false)
    expect(validateUrl('http://[fe80::1]/').valid).toBe(false)
  })
})

describe('isPrivateHost', () => {
  it('does not flag ordinary hostnames that merely start with private prefixes', () => {
    expect(isPrivateHost('fcbarcelona.com')).toBe(false)
    expect(isPrivateHost('example.com')).toBe(false)
  })
})
