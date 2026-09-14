/**
 * Pure helpers for extracting the OAuth callback from deep-link arguments.
 * Kept free of Electron imports so it can be unit tested directly.
 */

export const PROTOCOL = 'linkster'
export const OAUTH_CALLBACK_URL = 'linkster://auth/callback'

export function findDeepLink(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`)) ?? null
}

export interface AuthCallback {
  code: string | null
  error: string | null
}

export function parseAuthCallback(url: string | null): AuthCallback {
  if (!url) return { code: null, error: null }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { code: null, error: null }
  }

  if (parsed.protocol !== `${PROTOCOL}:`) return { code: null, error: null }
  if (parsed.hostname !== 'auth' || parsed.pathname !== '/callback') {
    return { code: null, error: null }
  }

  const error =
    parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error')
  const code = parsed.searchParams.get('code')

  return {
    code: code && code.length > 0 ? code : null,
    error: error && error.length > 0 ? error : null
  }
}
