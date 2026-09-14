import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/contract/ipc'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth-store'

export default function HomeScreen() {
  const user = useAuthStore((state) => state.user)
  const signOut = useAuthStore((state) => state.signOut)
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void api.system.getAppInfo().then((result) => {
      if (result.ok) setInfo(result.data)
    })
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 p-8 text-zinc-100">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Linkster</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">{user?.email ?? user?.id}</span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm transition hover:bg-white/5"
          >
            Sign out
          </button>
        </div>
      </header>

      <p className="mt-6 text-sm text-zinc-400">
        Authenticated shell placeholder — the link library arrives in Slice 2.
      </p>

      {info ? (
        <p className="mt-2 text-xs text-zinc-600">
          v{info.version} · Electron {info.electron} · {info.platform}/{info.arch}
        </p>
      ) : null}
    </div>
  )
}
