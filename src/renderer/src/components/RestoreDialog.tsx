import { useState } from 'react'
import type { RestoreMode, RestorePreview, RestoreSummary } from '@shared/contract/ipc'
import { useSettingsStore } from '../store/settings-store'
import ConfirmDialog from './ConfirmDialog'
import { Modal } from './ui'
import { primaryButtonClass, secondaryButtonClass } from './ui-classes'

export default function RestoreDialog({ onClose }: { onClose: () => void }) {
  const pickRestoreFile = useSettingsStore((state) => state.pickRestoreFile)
  const previewRestore = useSettingsStore((state) => state.previewRestore)
  const runRestore = useSettingsStore((state) => state.runRestore)

  const [path, setPath] = useState<string | null>(null)
  const [preview, setPreview] = useState<RestorePreview | null>(null)
  const [summary, setSummary] = useState<RestoreSummary | null>(null)
  const [mode, setMode] = useState<RestoreMode>('merge')
  const [busy, setBusy] = useState(false)
  const [confirmingReplace, setConfirmingReplace] = useState(false)

  const choose = async () => {
    const selected = await pickRestoreFile()
    if (!selected) return
    setPath(selected)
    setSummary(null)
    setPreview(await previewRestore(selected))
  }

  const restore = async () => {
    if (!path) return
    setBusy(true)
    const result = await runRestore(path, mode)
    setBusy(false)
    if (result) setSummary(result)
  }

  const requestRestore = () => {
    // Replace overwrites existing metadata and all app settings; require an
    // explicit confirmation instead of a single click.
    if (mode === 'replace') {
      setConfirmingReplace(true)
      return
    }
    void restore()
  }

  return (
    <Modal title="Restore from backup" onClose={busy ? () => undefined : onClose}>
      {!preview ? (
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-muted">
            Restore links, labels, colors, and saved articles from a Linkster backup file.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryButtonClass} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={primaryButtonClass} onClick={() => void choose()}>
              Choose backup…
            </button>
          </div>
        </div>
      ) : summary ? (
        <div className="space-y-4">
          <p className="text-xs text-primary">Restore complete.</p>
          <ul className="space-y-1 text-xs text-muted">
            <li>Added: {summary.added}</li>
            <li>Skipped: {summary.skipped}</li>
            <li>Conflicts: {summary.conflicted}</li>
            <li>Reader articles: {summary.contents}</li>
            {summary.failed > 0 ? (
              <li className="text-danger">Failed: {summary.failed}</li>
            ) : null}
          </ul>
          {summary.failed > 0 ? (
            <p className="text-xs text-danger">
              {summary.failed} rows could not be restored. The backup can be retried.
            </p>
          ) : null}
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
              Backup from {new Date(preview.manifest.createdAt).toLocaleString()} ·{' '}
              {preview.manifest.counts.links} links · {preview.manifest.counts.contents} articles
            </p>
            <p className="mt-1">
              <span className="text-primary">{preview.newLinks}</span> new ·{' '}
              <span className="text-primary">{preview.conflicts}</span> already present
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="restore-mode"
                checked={mode === 'merge'}
                onChange={() => setMode('merge')}
              />
              <span>
                Merge <span className="text-muted">(keep existing links unchanged)</span>
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="restore-mode"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
              />
              <span>
                Replace <span className="text-muted">(overwrite existing metadata and settings)</span>
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={busy}
              onClick={() => void choose()}
            >
              Choose another
            </button>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={busy}
              onClick={requestRestore}
            >
              {busy ? 'Restoring…' : 'Restore'}
            </button>
          </div>
        </div>
      )}

      {confirmingReplace ? (
        <ConfirmDialog
          title="Replace restore"
          message="This overwrites the metadata of every matching link and all app settings from the backup. This cannot be undone. Continue?"
          confirmLabel="Replace"
          onCancel={() => setConfirmingReplace(false)}
          onConfirm={async () => {
            setConfirmingReplace(false)
            await restore()
          }}
        />
      ) : null}
    </Modal>
  )
}
