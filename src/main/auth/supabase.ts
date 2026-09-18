import { safeStorage } from 'electron'
import { createClient } from '@supabase/supabase-js'
import { store } from '../store/store'
import { createTimeoutFetch } from './fetch-timeout'
import {
  createSessionStorage,
  type KeyValueBacking,
  type SecretCodec,
  type StoredSecrets
} from './session-storage'

const supabaseUrl = import.meta.env.MAIN_VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.MAIN_VITE_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0

const backing: KeyValueBacking = {
  get: () => store.get('authSession'),
  set: (_key, value) => store.set('authSession', value as StoredSecrets),
  delete: () => store.delete('authSession')
}

function isSecureStorageAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  // On Linux without a keyring Electron falls back to the `basic_text` backend,
  // which encrypts with a hardcoded key. Treat that as "no encryption" so the
  // session is never written to disk in a trivially recoverable form.
  if (process.platform === 'linux') {
    try {
      return safeStorage.getSelectedStorageBackend() !== 'basic_text'
    } catch {
      return false
    }
  }
  return true
}

const codec: SecretCodec = {
  isEncryptionAvailable: isSecureStorageAvailable,
  encryptString: (value) => safeStorage.encryptString(value).toString('base64'),
  decryptString: (payload) => safeStorage.decryptString(Buffer.from(payload, 'base64'))
}

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'http://127.0.0.1:54321',
  isSupabaseConfigured ? supabaseAnonKey : 'public-anon-key',
  {
    global: {
      fetch: createTimeoutFetch(fetch)
    },
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: createSessionStorage(backing, codec)
    }
  }
)
