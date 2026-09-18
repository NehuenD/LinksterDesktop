import { useModalBehavior } from './use-modal'

/**
 * Accessible lightbox for an X post capture: fit-to-width with scroll for tall
 * renders, Escape/close, focus trap and an "Open image" escape hatch to the OS
 * viewer (captures can be up to 5000px tall and are unreadable when shrunk).
 */
export default function XCaptureViewer({
  dataUrl,
  onClose,
  onOpenImage
}: {
  dataUrl: string
  onClose: () => void
  onOpenImage: () => void
}) {
  const ref = useModalBehavior(onClose)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="X post capture"
        tabIndex={-1}
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-subtle bg-panel shadow-panel outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-subtle px-4 py-2.5">
          <h2 className="font-display text-sm font-semibold tracking-tight">Capture</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenImage}
              className="rounded-md border border-subtle bg-raised px-2 py-1 text-xs text-muted transition hover:border-strong hover:text-primary"
            >
              Open image
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-6 w-6 items-center justify-center rounded-md text-base leading-none text-muted transition hover:bg-hover hover:text-primary"
            >
              ×
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-black/30 p-3">
          <img src={dataUrl} alt="X post capture" className="mx-auto w-full max-w-[550px] rounded-md" />
        </div>
      </div>
    </div>
  )
}
