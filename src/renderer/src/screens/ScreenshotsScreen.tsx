import { useEffect, useState } from 'react'
import type { Screenshot } from '@shared/contract/ipc'
import { formatRelativeTime } from '@shared/lib/format'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { api } from '../lib/api'
import { useScreenshotsStore } from '../store/screenshots-store'
import { useUiStore } from '../store/ui-store'

function ScreenshotCard({ screenshot }: { screenshot: Screenshot }) {
  const reveal = useScreenshotsStore((state) => state.reveal)
  const copyPath = useScreenshotsStore((state) => state.copyPath)
  const remove = useScreenshotsStore((state) => state.remove)
  const [confirming, setConfirming] = useState(false)

  const actionClass =
    'rounded-md bg-black/55 px-1.5 py-1 text-xs font-medium text-white ring-1 ring-white/10 backdrop-blur transition hover:bg-black/80'

  return (
    <>
      <div className="edge-highlight group relative overflow-hidden rounded-lg border border-subtle bg-raised transition hover:border-strong">
        <div className="flex h-36 w-full items-center justify-center overflow-hidden bg-hover">
          {screenshot.thumbnailUrl ? (
            <img
              src={screenshot.thumbnailUrl}
              alt={screenshot.fileName}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <span className="text-xs text-muted">No preview</span>
          )}
        </div>

        <div className="absolute left-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            className={actionClass}
            onClick={() => void reveal(screenshot.filePath)}
          >
            Reveal
          </button>
          <button
            type="button"
            className={actionClass}
            onClick={() => void copyPath(screenshot.filePath)}
          >
            Copy path
          </button>
          <button type="button" className={actionClass} onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>

        <div className="p-2.5">
          <p className="truncate text-xs text-primary">{screenshot.fileName}</p>
          <p className="text-xs text-muted">{formatRelativeTime(screenshot.capturedAt)}</p>
        </div>
      </div>

      {confirming ? (
        <ConfirmDialog
          title="Delete screenshot"
          message={`Delete ${screenshot.fileName}? This removes the file from disk.`}
          confirmLabel="Delete"
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            await remove(screenshot.filePath)
            setConfirming(false)
          }}
        />
      ) : null}
    </>
  )
}

export default function ScreenshotsScreen() {
  const items = useScreenshotsStore((state) => state.items)
  const folder = useScreenshotsStore((state) => state.folder)
  const detected = useScreenshotsStore((state) => state.detected)
  const status = useScreenshotsStore((state) => state.status)
  const error = useScreenshotsStore((state) => state.error)
  const load = useScreenshotsStore((state) => state.load)
  const loadFolder = useScreenshotsStore((state) => state.loadFolder)
  const chooseFolder = useScreenshotsStore((state) => state.chooseFolder)
  const setView = useUiStore((state) => state.setView)

  useEffect(() => {
    void loadFolder()
    void load()
  }, [loadFolder, load])

  useEffect(() => {
    return api.screenshots.onChanged(() => {
      void load()
    })
  }, [load])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface text-primary">
      <header className="flex items-center gap-3 border-b border-subtle px-4 py-2.5">
        <button
          type="button"
          onClick={() => setView('library')}
          className="text-xs text-muted transition hover:text-primary"
        >
          ← Library
        </button>
        <span className="h-3 w-px bg-subtle" />
        <h1 className="font-display text-sm font-semibold tracking-tight">Screenshots</h1>
        <span className="font-mono text-xs text-muted">{items.length}</span>

        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-muted transition hover:text-primary"
        >
          Refresh
        </button>

        <button
          type="button"
          onClick={() => void chooseFolder()}
          className="ml-auto rounded-md border border-subtle bg-raised px-2.5 py-1.5 text-xs transition hover:border-strong hover:bg-hover"
        >
          Change folder
        </button>
      </header>

      <p className="px-4 py-1.5 font-mono text-xs text-muted">
        {folder ? folder : 'No screenshots folder detected.'}
        {detected && detected !== folder ? ` (detected: ${detected})` : ''}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error ? (
          <div
            role="alert"
            className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {error}
          </div>
        ) : null}

        {status === 'loading' && items.length === 0 ? (
          <p className="text-xs text-muted">Loading screenshots…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="No screenshots"
            description="Screenshots taken with your system tool will appear here automatically."
          />
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
            {items.map((screenshot) => (
              <ScreenshotCard key={screenshot.id} screenshot={screenshot} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
