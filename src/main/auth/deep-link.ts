/**
 * Pure helpers for extracting the OAuth callback from deep-link arguments.
 * Kept free of Electron imports so it can be unit tested directly.
 */

export const PROTOCOL = 'linkster'
export const OAUTH_CALLBACK_URL = 'linkster://auth/callback'

export function findDeepLink(argv: readonly string[]): string | null {
  // Windows hands custom-scheme URLs to the process with the scheme case
  // preserved by the OS, so compare case-insensitively.
  return (
    argv.find((arg) => arg.slice(0, PROTOCOL.length + 3).toLowerCase() === `${PROTOCOL}://`) ??
    null
  )
}

export interface AuthCallback {
  code: string | null
  error: string | null
  /** OAuth state echoed back by the provider; verified against the pending flow. */
  state: string | null
}

export function parseAuthCallback(url: string | null): AuthCallback {
  if (!url) return { code: null, error: null, state: null }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { code: null, error: null, state: null }
  }

  if (parsed.protocol !== `${PROTOCOL}:`) return { code: null, error: null, state: null }
  if (parsed.hostname !== 'auth' || parsed.pathname !== '/callback') {
    return { code: null, error: null, state: null }
  }

  const error =
    parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error')
  const code = parsed.searchParams.get('code')
  const state = parsed.searchParams.get('state')

  return {
    code: code && code.length > 0 ? code : null,
    error: error && error.length > 0 ? error : null,
    state: state && state.length > 0 ? state : null
  }
}
