import { useToastStore } from '../store/toast-store'

export default function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-2xl ${
            toast.type === 'error'
              ? 'border-accent/40 bg-accent/15'
              : toast.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-subtle bg-surface'
          }`}
        >
          <span className="flex-1 break-words">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss"
            className="text-muted transition hover:text-primary"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
