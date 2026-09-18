import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/auth-store'

function LinkMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4.5 w-4.5">
      <path
        d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function LoginScreen() {
  const status = useAuthStore((state) => state.status)
  const error = useAuthStore((state) => state.error)
  const signIn = useAuthStore((state) => state.signIn)
  const isLoading = status === 'loading'
  const [slow, setSlow] = useState(false)

  // If the browser hand-off stalls, offer a retry instead of waiting forever.
  useEffect(() => {
    if (!isLoading) return
    const timer = setTimeout(() => setSlow(true), 10_000)
    return () => clearTimeout(timer)
  }, [isLoading])

  const retry = (): void => {
    setSlow(false)
    void signIn()
  }

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden bg-surface p-8 text-primary">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_-10%,rgba(91,140,255,0.16),transparent_70%)]"
      />

      <main className="relative w-full max-w-sm rounded-2xl border border-subtle bg-panel/80 p-7 text-center shadow-panel backdrop-blur-xl">
        <span className="mx-auto mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <LinkMark />
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Linkster</h1>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Your links, captured automatically and organized your way.
        </p>

        <button
          type="button"
          onClick={retry}
          disabled={isLoading}
          className="mt-6 w-full rounded-md bg-accent px-4 py-2 text-xs font-medium text-accent-fg transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? 'Waiting for browser…' : 'Continue with Google'}
        </button>

        {isLoading && slow ? (
          <p className="mt-3 text-xs text-muted">
            Still waiting? Finish in your browser, or{' '}
            <button
              type="button"
              onClick={retry}
              className="font-medium text-accent transition hover:brightness-125"
            >
              try again
            </button>
            .
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </main>
    </div>
  )
}
