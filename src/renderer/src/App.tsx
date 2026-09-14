import { useEffect } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import Toaster from './components/Toaster'
import { api } from './lib/api'
import HomeScreen from './screens/HomeScreen'
import LoginScreen from './screens/LoginScreen'
import { useAuthStore } from './store/auth-store'
import { useThemeStore } from './store/theme-store'

export default function App() {
  const status = useAuthStore((state) => state.status)
  const apply = useAuthStore((state) => state.apply)
  const refresh = useAuthStore((state) => state.refresh)
  const mode = useThemeStore((state) => state.mode)
  const loadTheme = useThemeStore((state) => state.load)

  useEffect(() => {
    void refresh()
    void loadTheme()
    return api.auth.onChanged(apply)
  }, [apply, refresh, loadTheme])

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => document.documentElement.classList.toggle('light', !query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [mode])

  const content =
    status === 'initial' ? (
      <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-muted">
        Loading…
      </div>
    ) : status === 'authenticated' ? (
      <HomeScreen />
    ) : (
      <LoginScreen />
    )

  return (
    <>
      <ErrorBoundary>{content}</ErrorBoundary>
      <Toaster />
    </>
  )
}
