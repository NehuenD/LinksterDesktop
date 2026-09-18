import { useToastStore } from '../store/toast-store'

export default function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-3 right-3 z-50 flex max-w-xs flex-col gap-1.5">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-xs shadow-panel backdrop-blur ${
            toast.type === 'error'
              ? 'border-danger/40 bg-danger/15'
              : toast.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-subtle bg-panel'
          }`}
        >
          <span className="flex-1 break-words leading-relaxed">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss"
            className="-mr-0.5 -mt-0.5 shrink-0 rounded p-0.5 text-muted transition hover:bg-hover hover:text-primary"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
