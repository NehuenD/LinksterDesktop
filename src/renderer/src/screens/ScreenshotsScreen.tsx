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
    'rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-white backdrop-blur transition hover:bg-black/90'

  return (
    <>
      <div className="group relative overflow-hidden rounded-xl border border-subtle bg-raised">
        <div className="flex h-40 w-full items-center justify-center overflow-hidden bg-hover">
          {screenshot.thumbnailUrl ? (
            <img
              src={screenshot.thumbnailUrl}
              alt={screenshot.fileName}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-sm text-muted">No preview</span>
          )}
        </div>

        <div className="absolute left-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button type="button" className={actionClass} onClick={() => void reveal(screenshot.filePath)}>
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

        <div className="p-3">
          <p className="truncate text-sm text-primary">{screenshot.fileName}</p>
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
      <header className="flex items-center gap-4 border-b border-subtle px-6 py-4">
        <button
          type="button"
          onClick={() => setView('library')}
          className="text-sm text-muted transition hover:text-primary"
        >
          ← Library
        </button>
        <h1 className="font-display text-lg font-semibold">Screenshots</h1>
        <span className="text-sm text-muted">{items.length}</span>

        <button
          type="button"
          onClick={() => void load()}
          className="text-sm text-muted transition hover:text-primary"
        >
          Refresh
        </button>

        <button
          type="button"
          onClick={() => void chooseFolder()}
          className="ml-auto rounded-lg border border-subtle px-3 py-2 text-sm transition hover:bg-hover"
        >
          Change folder
        </button>
      </header>

      <p className="px-6 py-2 text-xs text-muted">
        {folder ? folder : 'No screenshots folder detected.'}
        {detected && detected !== folder ? ` (detected: ${detected})` : ''}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm"
          >
            {error}
          </div>
        ) : null}

        {status === 'loading' && items.length === 0 ? (
          <p className="text-sm text-muted">Loading screenshots…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="No screenshots"
            description="Screenshots taken with your system tool will appear here automatically."
          />
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {items.map((screenshot) => (
              <ScreenshotCard key={screenshot.id} screenshot={screenshot} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
