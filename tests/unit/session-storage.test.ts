import { describe, expect, it } from 'vitest'
import {
  createSessionStorage,
  type KeyValueBacking,
  type SecretCodec
} from '../../src/main/auth/session-storage'

function createBacking(): { backing: KeyValueBacking; map: Map<string, unknown> } {
  const map = new Map<string, unknown>()
  const backing: KeyValueBacking = {
    get: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, value)
    },
    delete: (key) => {
      map.delete(key)
    }
  }
  return { backing, map }
}

const encryptingCodec: SecretCodec = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => `enc:${value}`,
  decryptString: (payload) => payload.replace(/^enc:/, '')
}

const unavailableCodec: SecretCodec = {
  isEncryptionAvailable: () => false,
  encryptString: () => {
    throw new Error('encryptString should not be called without encryption')
  },
  decryptString: () => {
    throw new Error('decryptString should not be called without encryption')
  }
}

describe('createSessionStorage', () => {
  it('round-trips a value stored under the same key', () => {
    const { backing } = createBacking()
    const storage = createSessionStorage(backing, encryptingCodec)
    storage.setItem('sb-session', 'token-value')
    expect(storage.getItem('sb-session')).toBe('token-value')
  })

  it('returns null for a non-matching key', () => {
    const { backing } = createBacking()
    const storage = createSessionStorage(backing, encryptingCodec)
    storage.setItem('sb-session', 'token-value')
    expect(storage.getItem('other-key')).toBeNull()
  })

  it('removes only the matching key', () => {
    const { backing } = createBacking()
    const storage = createSessionStorage(backing, encryptingCodec)
    storage.setItem('sb-session', 'token-value')
    storage.removeItem('other-key')
    expect(storage.getItem('sb-session')).toBe('token-value')
    storage.removeItem('sb-session')
    expect(storage.getItem('sb-session')).toBeNull()
  })

  it('preserves multiple keys independently', () => {
    const { backing } = createBacking()
    const storage = createSessionStorage(backing, encryptingCodec)
    storage.setItem('sb-session', 'session-value')
    storage.setItem('sb-verifier', 'verifier-value')
    expect(storage.getItem('sb-session')).toBe('session-value')
    expect(storage.getItem('sb-verifier')).toBe('verifier-value')
    storage.removeItem('sb-session')
    expect(storage.getItem('sb-session')).toBeNull()
    expect(storage.getItem('sb-verifier')).toBe('verifier-value')
  })

  it('falls back to plaintext when encryption is unavailable', () => {
    const { backing, map } = createBacking()
    const storage = createSessionStorage(backing, unavailableCodec)
    storage.setItem('sb-session', 'token-value')
    expect(storage.getItem('sb-session')).toBe('token-value')
    expect(JSON.stringify(map.get('authSession'))).toContain('plain:')
  })

  it('returns null when the payload cannot be decoded', () => {
    const { backing } = createBacking()
    const failingCodec: SecretCodec = {
      isEncryptionAvailable: () => true,
      encryptString: (value) => value,
      decryptString: () => {
        throw new Error('bad payload')
      }
    }
    const storage = createSessionStorage(backing, failingCodec)
    storage.setItem('sb-session', 'token')
    expect(storage.getItem('sb-session')).toBeNull()
  })
})
