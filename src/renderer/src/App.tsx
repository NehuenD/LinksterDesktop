import { useEffect } from 'react'
import { api } from './lib/api'
import HomeScreen from './screens/HomeScreen'
import LoginScreen from './screens/LoginScreen'
import { useAuthStore } from './store/auth-store'

export default function App() {
  const status = useAuthStore((state) => state.status)
  const apply = useAuthStore((state) => state.apply)
  const refresh = useAuthStore((state) => state.refresh)

  useEffect(() => {
    void refresh()
    return api.auth.onChanged(apply)
  }, [apply, refresh])

  if (status === 'initial') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-500">
        Loading…
      </div>
    )
  }

  if (status === 'authenticated') {
    return <HomeScreen />
  }

  return <LoginScreen />
}
