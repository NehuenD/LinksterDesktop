import { useCallback, useEffect, useState } from 'react'
import type { AppInfo } from '@shared/contract/ipc'
import { api } from './lib/api'

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [pingResult, setPingResult] = useState('not pinged yet')
  const [latency, setLatency] = useState<number | null>(null)

  useEffect(() => {
    void api.system.getAppInfo().then((result) => {
      if (result.ok) setInfo(result.data)
    })
  }, [])

  const handlePing = useCallback(async () => {
    const started = performance.now()
    const result = await api.system.ping()
    if (result.ok) {
      setPingResult(result.data.pong ? 'pong' : 'unexpected response')
      setLatency(Math.round(performance.now() - started))
    } else {
      setPingResult(`error: ${result.error.message}`)
    }
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-8 text-zinc-100">
      <main className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-10 backdrop-blur-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-500">
          Walking skeleton
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">Linkster</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Electron + React + TypeScript. Slice 0 boots the shell and proves the IPC bridge.
        </p>

        <button
          type="button"
          onClick={handlePing}
          className="mt-8 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500"
        >
          Ping main process
        </button>

        <p data-testid="ping-result" className="mt-4 text-sm text-zinc-300">
          {pingResult}
          {latency !== null ? ` (${latency} ms)` : ''}
        </p>

        {info ? (
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-white/10 pt-6 text-sm">
            <dt className="text-zinc-500">Version</dt>
            <dd className="text-zinc-200">{info.version}</dd>
            <dt className="text-zinc-500">Electron</dt>
            <dd className="text-zinc-200">{info.electron}</dd>
            <dt className="text-zinc-500">Chromium</dt>
            <dd className="text-zinc-200">{info.chrome}</dd>
            <dt className="text-zinc-500">Platform</dt>
            <dd className="text-zinc-200">
              {info.platform} / {info.arch}
            </dd>
          </dl>
        ) : null}
      </main>
    </div>
  )
}
