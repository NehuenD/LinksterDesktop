import { useEffect, useState } from 'react'
import type { ImportPreview, ImportProgress, ImportSummary } from '@shared/contract/ipc'
import { api } from '../lib/api'
import { useSettingsStore } from '../store/settings-store'
import { Field, Modal } from './ui'
import { inputClass, primaryButtonClass, secondaryButtonClass } from './ui-classes'

export default function ImportDialog({ onClose }: { onClose: () => void }) {
  const pickImportFile = useSettingsStore((state) => state.pickImportFile)
  const previewImport = useSettingsStore((state) => state.previewImport)
  const runImport = useSettingsStore((state) => state.runImport)
  const cancelImport = useSettingsStore((state) => state.cancelImport)

  const [path, setPath] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [defaultLabel, setDefaultLabel] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => api.data.onImportProgress(setProgress), [])

  const choose = async () => {
    const selected = await pickImportFile()
    if (!selected) return
    setPath(selected)
    setSummary(null)
    setProgress(null)
    setPreview(await previewImport(selected))
  }

  const start = async () => {
    if (!path || !preview) return
    setBusy(true)
    const result = await runImport(path, {
      source: preview.source,
      ...(defaultLabel.trim() ? { defaultLabel: defaultLabel.trim() } : {})
    })
    setBusy(false)
    if (result) setSummary(result)
  }

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : 0

  return (
    <Modal title="Import links" onClose={busy ? () => undefined : onClose}>
      {!preview ? (
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-muted">
            Import from a browser bookmarks export (Chrome, Edge, Firefox) or a
            Pocket/Instapaper/Raindrop CSV. Folder names and tags become labels.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryButtonClass} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={primaryButtonClass} onClick={() => void choose()}>
              Choose file…
            </button>
          </div>
        </div>
      ) : summary ? (
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-primary">
            {summary.cancelled ? 'Import cancelled.' : 'Import complete.'}
          </p>
          <ul className="space-y-1 text-xs text-muted">
            <li>Added: {summary.added}</li>
            <li>Skipped (already saved): {summary.skipped}</li>
            <li>Failed: {summary.failed}</li>
            <li>Invalid rows: {summary.invalid}</li>
          </ul>
          <div className="flex justify-end">
            <button type="button" className={primaryButtonClass} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-xs text-muted">
            <p className="break-all font-mono text-xs">{path}</p>
            <p className="mt-1">
              Detected: <span className="text-primary">{preview.source}</span> · {preview.total}{' '}
              links · {preview.duplicates} already saved · {preview.invalid} invalid
            </p>
          </div>

          {preview.sample.length > 0 && (
            <ul className="max-h-32 space-y-1 overflow-auto rounded-md border border-subtle bg-raised p-2 text-xs text-muted">
              {preview.sample.map((item) => (
                <li key={item.url} className="truncate">
                  <span className="text-primary">{item.title ?? item.url}</span> · {item.label}
                </li>
              ))}
            </ul>
          )}

          <Field label="Fallback label (for items without a folder or tag)">
            <input
              className={inputClass}
              value={defaultLabel}
              placeholder="General"
              onChange={(event) => setDefaultLabel(event.target.value)}
            />
          </Field>

          {busy && (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-xs text-muted">
                {progress ? `${progress.added} added` : 'Preparing…'}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {busy ? (
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => void cancelImport()}
              >
                Cancel import
              </button>
            ) : (
              <>
                <button type="button" className={secondaryButtonClass} onClick={() => void choose()}>
                  Choose another
                </button>
                <button type="button" className={primaryButtonClass} onClick={() => void start()}>
                  Import {preview.total - preview.duplicates} links
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
