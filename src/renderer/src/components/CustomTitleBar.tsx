import type { CSSProperties } from 'react'
import { api } from '../lib/api'
import { useUiStore } from '../store/ui-store'

const dragStyle = { WebkitAppRegion: 'drag' } as CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties

export default function CustomTitleBar() {
  const platform = useUiStore((state) => state.platform)

  if (!platform || platform === 'darwin') return null

  return (
    <div
      className="flex h-9 shrink-0 items-center justify-between border-b border-subtle bg-raised px-3"
      style={dragStyle}
    >
      <span className="font-display text-xs font-semibold tracking-wide text-muted">
        Linkster
      </span>

      <div className="flex items-center gap-1" style={noDragStyle}>
        <button
          type="button"
          aria-label="Minimize"
          onClick={() => void api.system.minimize()}
          className="flex h-7 w-9 items-center justify-center rounded text-muted transition hover:bg-hover hover:text-primary"
        >
          −
        </button>
        <button
          type="button"
          aria-label="Maximize"
          onClick={() => void api.system.toggleMaximize()}
          className="flex h-7 w-9 items-center justify-center rounded text-muted transition hover:bg-hover hover:text-primary"
        >
          ▢
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={() => void api.system.close()}
          className="flex h-7 w-9 items-center justify-center rounded text-muted transition hover:bg-accent hover:text-white"
        >
          ×
        </button>
      </div>
    </div>
  )
}
