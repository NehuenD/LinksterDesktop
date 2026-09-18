import { useEffect } from 'react'
import CustomTitleBar from './components/CustomTitleBar'
import ErrorBoundary from './components/ErrorBoundary'
import ReaderView from './components/ReaderView'
import SyncBanner from './components/SyncBanner'
import Toaster from './components/Toaster'
import { api } from './lib/api'
import HomeScreen from './screens/HomeScreen'
import LoginScreen from './screens/LoginScreen'
import { useAuthStore } from './store/auth-store'
import { useLinksStore } from './store/links-store'
import { useSettingsStore } from './store/settings-store'
import { useThemeStore } from './store/theme-store'
import { useUiStore } from './store/ui-store'

export default function App() {
  const status = useAuthStore((state) => state.status)
  const apply = useAuthStore((state) => state.apply)
  const refresh = useAuthStore((state) => state.refresh)
  const mode = useThemeStore((state) => state.mode)
  const loadTheme = useThemeStore((state) => state.load)
  const setPlatform = useUiStore((state) => state.setPlatform)
  const readerLinkId = useUiStore((state) => state.readerLinkId)
  const loadPending = useLinksStore((state) => state.loadPending)
  const setRealtimeStatus = useLinksStore((state) => state.setRealtimeStatus)

  useEffect(() => {
    void refresh()
    void loadTheme()
    // Reading preferences gate auto-mark-read, so load them before any link
    // is opened (not only when the settings screen mounts).
    void useSettingsStore.getState().loadReading()
    void api.system.getAppInfo().then((result) => {
      if (result.ok) setPlatform(result.data.platform)
    })
    return api.auth.onChanged(apply)
  }, [apply, refresh, loadTheme, setPlatform])

  useEffect(() => {
    if (status !== 'authenticated') return
    void loadPending()
    return api.links.onPendingChanged(() => {
      void useLinksStore.getState().loadPending()
    })
  }, [status, loadPending])

  useEffect(() => {
    void api.realtime.getStatus().then((result) => {
      if (result.ok) setRealtimeStatus(result.data)
    })
    return api.realtime.onStatus(setRealtimeStatus)
  }, [setRealtimeStatus])

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => document.documentElement.classList.toggle('light', !query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [mode])

  const content =
    status === 'initial' ? (
      <div className="flex h-full items-center justify-center bg-surface text-xs text-muted">
        Loading…
      </div>
    ) : status === 'authenticated' ? (
      <HomeScreen />
    ) : (
      <LoginScreen />
    )

  return (
    <>
      <ErrorBoundary>
        <div className="flex h-screen flex-col overflow-hidden bg-surface text-primary">
          <CustomTitleBar />
          <SyncBanner />
          <div className="min-h-0 flex-1">{content}</div>
          {/* Global overlay: the reader/media view opens from any section, not just the library. */}
          {status === 'authenticated' && readerLinkId ? (
            <ReaderView linkId={readerLinkId} />
          ) : null}
        </div>
      </ErrorBoundary>
      <Toaster />
    </>
  )
}
