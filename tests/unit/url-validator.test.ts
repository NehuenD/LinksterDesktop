import { describe, expect, it, vi } from 'vitest'
import {
  assertPublicHost,
  isPrivateHost,
  isSafeExternalUrl,
  validateUrl
} from '../../src/main/services/url-validator'

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

  it('rejects IPv6 loopback, link-local, site-local and unique-local addresses', () => {
    expect(validateUrl('http://[::1]/').valid).toBe(false)
    expect(validateUrl('http://[fd00::1]/').valid).toBe(false)
    expect(validateUrl('http://[fe80::1]/').valid).toBe(false)
    expect(validateUrl('http://[fec0::1]/').valid).toBe(false)
    expect(validateUrl('http://[feff::1]/').valid).toBe(false)
  })

  it('rejects IPv4-mapped IPv6 private addresses', () => {
    expect(validateUrl('http://[::ffff:127.0.0.1]/').valid).toBe(false)
    expect(validateUrl('http://[::ffff:169.254.169.254]/').valid).toBe(false)
  })

  it('rejects Windows filesystem paths instead of capturing a bogus link', () => {
    expect(validateUrl('C:\\Users\\me\\Pictures\\shot.png').valid).toBe(false)
    expect(validateUrl('C:/Users/me/Pictures/shot.png').valid).toBe(false)
    expect(validateUrl('\\\\server\\share\\shot.png').valid).toBe(false)
  })
})

describe('isSafeExternalUrl', () => {
  it('accepts only http(s)', () => {
    expect(isSafeExternalUrl('https://example.com')).toBe(true)
    expect(isSafeExternalUrl('http://example.com/a')).toBe(true)
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('linkster://auth/callback')).toBe(false)
    expect(isSafeExternalUrl('  https://example.com  ')).toBe(true)
  })

  it('rejects non-strings and control-character smuggling', () => {
    expect(isSafeExternalUrl(undefined)).toBe(false)
    expect(isSafeExternalUrl(42)).toBe(false)
    expect(isSafeExternalUrl('https://exa\u0000mple.com')).toBe(false)
  })
})

describe('isPrivateHost', () => {
  it('does not flag ordinary hostnames that merely start with private prefixes', () => {
    expect(isPrivateHost('fcbarcelona.com')).toBe(false)
    expect(isPrivateHost('example.com')).toBe(false)
  })

  it('flags IPv4-mapped IPv6 loopback addresses', () => {
    expect(isPrivateHost('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateHost('::ffff:169.254.169.254')).toBe(true)
  })

  it('flags IPv4-compatible IPv6, NAT64, 6to4 and reserved ranges', () => {
    expect(isPrivateHost('[::169.254.169.254]')).toBe(true)
    expect(isPrivateHost('[::7f00:1]')).toBe(true)
    expect(isPrivateHost('[64:ff9b::a9fe:a9fe]')).toBe(true)
    expect(isPrivateHost('[2002:a9fe:a9fe::1]')).toBe(true)
    expect(isPrivateHost('100.100.100.200')).toBe(true)
    expect(isPrivateHost('100.64.0.1')).toBe(true)
    expect(isPrivateHost('198.18.0.1')).toBe(true)
    expect(isPrivateHost('192.0.0.1')).toBe(true)
    expect(isPrivateHost('224.0.0.1')).toBe(true)
    expect(isPrivateHost('255.255.255.255')).toBe(true)
    expect(isPrivateHost('2001:db8::1')).toBe(true)
  })

  it('still accepts public addresses', () => {
    expect(isPrivateHost('93.184.216.34')).toBe(false)
    expect(isPrivateHost('8.8.8.8')).toBe(false)
    expect(isPrivateHost('2606:2800:220:1:248:1893:25c8:1946')).toBe(false)
    expect(isPrivateHost('[2001:4860:4860::8888]')).toBe(false)
  })
})

describe('assertPublicHost', () => {
  it('accepts a hostname that resolves only to public addresses', async () => {
    const lookup = vi.fn(async () => ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'])
    expect(await assertPublicHost('example.com', lookup)).toBe(true)
  })

  it('rejects a hostname when any resolved address is private', async () => {
    const lookup = vi.fn(async () => ['93.184.216.34', '169.254.169.254'])
    expect(await assertPublicHost('metadata.example.com', lookup)).toBe(false)
  })

  it('rejects when resolution fails', async () => {
    const lookup = vi.fn(async () => {
      throw new Error('ENOTFOUND')
    })
    expect(await assertPublicHost('nope.invalid', lookup)).toBe(false)
  })

  it('rejects when resolution yields no addresses', async () => {
    const lookup = vi.fn(async () => [])
    expect(await assertPublicHost('empty.example', lookup)).toBe(false)
  })

  it('rejects literal private hosts without resolving', async () => {
    const lookup = vi.fn(async () => ['93.184.216.34'])
    expect(await assertPublicHost('127.0.0.1', lookup)).toBe(false)
    expect(await assertPublicHost('localhost', lookup)).toBe(false)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('accepts literal public IPs without resolving', async () => {
    const lookup = vi.fn(async () => {
      throw new Error('should not resolve')
    })
    expect(await assertPublicHost('93.184.216.34', lookup)).toBe(true)
    expect(lookup).not.toHaveBeenCalled()
  })
})
