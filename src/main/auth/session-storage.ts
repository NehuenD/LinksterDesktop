/**
 * Synchronous storage adapter compatible with supabase-js, backed by an
 * arbitrary key/value store and an optional secret codec. Pure (no Electron
 * imports) so the encryption fallback and multi-key logic are unit tested.
 *
 * All supabase-js keys (session, PKCE code verifier, ...) are held in a single
 * record so they can coexist and survive an app restart mid-flow.
 */

export interface KeyValueBacking {
  get(key: string): unknown
  set(key: string, value: unknown): void
  delete(key: string): void
}

export interface SecretCodec {
  isEncryptionAvailable(): boolean
  encryptString(value: string): string
  decryptString(payload: string): string
}

export interface SessionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Encoded secrets keyed by the key supabase-js requested. */
export type StoredSecrets = Record<string, string>

const PLAIN_PREFIX = 'plain:'

function readRecord(backing: KeyValueBacking, storageKey: string): StoredSecrets {
  const value = backing.get(storageKey)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return { ...(value as StoredSecrets) }
}

function encodeSecret(codec: SecretCodec, value: string): string {
  if (!codec.isEncryptionAvailable()) {
    return PLAIN_PREFIX + Buffer.from(value, 'utf8').toString('base64')
  }
  return codec.encryptString(value)
}

function decodeSecret(codec: SecretCodec, payload: string): string {
  if (payload.startsWith(PLAIN_PREFIX)) {
    return Buffer.from(payload.slice(PLAIN_PREFIX.length), 'base64').toString('utf8')
  }
  return codec.decryptString(payload)
}

export function createSessionStorage(
  backing: KeyValueBacking,
  codec: SecretCodec,
  storageKey = 'authSession'
): SessionStorage {
  return {
    getItem(key) {
      const encoded = readRecord(backing, storageKey)[key]
      if (typeof encoded !== 'string') return null
      try {
        return decodeSecret(codec, encoded)
      } catch {
        return null
      }
    },

    setItem(key, value) {
      const record = readRecord(backing, storageKey)
      record[key] = encodeSecret(codec, value)
      backing.set(storageKey, record)
    },

    removeItem(key) {
      const record = readRecord(backing, storageKey)
      if (key in record) {
        delete record[key]
        backing.set(storageKey, record)
      }
    }
  }
}
