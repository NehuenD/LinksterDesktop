import { useAuthStore } from '../store/auth-store'

export default function LoginScreen() {
  const status = useAuthStore((state) => state.status)
  const error = useAuthStore((state) => state.error)
  const signIn = useAuthStore((state) => state.signIn)
  const isLoading = status === 'loading'

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-8 text-primary">
      <main className="w-full max-w-md rounded-3xl border border-subtle bg-raised p-10 text-center backdrop-blur-2xl">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Linkster</h1>
        <p className="mt-3 text-sm text-muted">
          Your links, captured automatically and organized your way.
        </p>

        <button
          type="button"
          onClick={() => void signIn()}
          disabled={isLoading}
          className="mt-8 w-full rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? 'Waiting for browser…' : 'Continue with Google'}
        </button>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-accent">
            {error}
          </p>
        ) : null}
      </main>
    </div>
  )
}
