/**
 * A navigation is only allowed to the window's own entry document. In dev the
 * renderer is served over http, so same-origin navigations (Vite) are allowed;
 * in production the app is a single local file, so only the exact file is.
 *
 * Pure (no Electron imports) so the policy is unit tested directly.
 */
export function isAllowedNavigation(target: string, appUrl: string): boolean {
  try {
    const destination = new URL(target)
    const app = new URL(appUrl)
    if (app.protocol === 'file:') return destination.href === app.href
    return destination.origin === app.origin
  } catch {
    return false
  }
}
