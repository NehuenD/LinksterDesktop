import { useState } from 'react'
import { DEFAULT_LABEL, type IpcResult } from '@shared/contract/ipc'
import { labelColor } from '@shared/lib/label-color'
import { isProtectedLabel } from '@shared/lib/labels'
import { useLinksStore } from '../store/links-store'
import ConfirmDialog from './ConfirmDialog'
import { Modal, inputClass, primaryButtonClass, secondaryButtonClass } from './ui'

export default function LabelManagerDialog({ onClose }: { onClose: () => void }) {
  const labels = useLinksStore((state) => state.labels)
  const stats = useLinksStore((state) => state.stats)
  const createLabel = useLinksStore((state) => state.createLabel)
  const renameLabel = useLinksStore((state) => state.renameLabel)
  const mergeLabel = useLinksStore((state) => state.mergeLabel)
  const deleteLabel = useLinksStore((state) => state.deleteLabel)

  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [merging, setMerging] = useState<string | null>(null)
  const [mergeTarget, setMergeTarget] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<IpcResult<string[]>>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    const result = await action()
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return false
    }
    return true
  }

  return (
    <>
      <Modal title="Manage labels" onClose={onClose}>
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New label name"
              className={inputClass}
            />
            <button
              type="button"
              onClick={async () => {
                if (await run(() => createLabel(newName))) setNewName('')
              }}
              disabled={busy || newName.trim().length === 0}
              className={primaryButtonClass}
            >
              Add
            </button>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-accent">
              {error}
            </p>
          ) : null}

          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {labels.map((name) => {
              const locked = isProtectedLabel(name)

              if (renaming === name) {
                return (
                  <li key={name} className="rounded-lg border border-subtle p-2">
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (await run(() => renameLabel(name, renameValue))) setRenaming(null)
                        }}
                        disabled={busy}
                        className={primaryButtonClass}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenaming(null)}
                        className={secondaryButtonClass}
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                )
              }

              if (merging === name) {
                return (
                  <li key={name} className="rounded-lg border border-subtle p-2">
                    <div className="flex gap-2">
                      <select
                        value={mergeTarget}
                        onChange={(event) => setMergeTarget(event.target.value)}
                        className={inputClass}
                      >
                        <option value="">Merge into…</option>
                        {labels
                          .filter((label) => label !== name)
                          .map((label) => (
                            <option key={label} value={label}>
                              {label}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={async () => {
                          if (await run(() => mergeLabel(name, mergeTarget))) {
                            setMerging(null)
                            setMergeTarget('')
                          }
                        }}
                        disabled={busy || mergeTarget === ''}
                        className={primaryButtonClass}
                      >
                        Merge
                      </button>
                      <button
                        type="button"
                        onClick={() => setMerging(null)}
                        className={secondaryButtonClass}
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                )
              }

              return (
                <li
                  key={name}
                  className="flex items-center gap-2 rounded-lg border border-subtle p-2"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: labelColor(name) }}
                  />
                  <span className="flex-1 truncate">{name}</span>
                  <span className="text-xs text-muted">{stats.byLabel[name] ?? 0}</span>
                  {locked ? (
                    <span className="text-xs text-muted">protected</span>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRenaming(name)
                          setRenameValue(name)
                        }}
                        className="text-xs text-muted transition hover:text-primary"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMerging(name)
                          setMergeTarget('')
                        }}
                        className="text-xs text-muted transition hover:text-primary"
                      >
                        Merge
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(name)}
                        className="text-xs text-accent transition hover:opacity-80"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </Modal>

      {deleting ? (
        <ConfirmDialog
          title={`Delete "${deleting}"`}
          message={`Links labeled "${deleting}" will be moved to ${DEFAULT_LABEL}.`}
          confirmLabel="Delete label"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await run(() => deleteLabel(deleting))
            setDeleting(null)
          }}
        />
      ) : null}
    </>
  )
}
