import { useState } from 'react'
import { DEFAULT_LABEL, type IpcResult } from '@shared/contract/ipc'
import { labelColor } from '@shared/lib/label-color'
import { isProtectedLabel, normalizeLabelName } from '@shared/lib/labels'
import { useLinksStore } from '../store/links-store'
import ConfirmDialog from './ConfirmDialog'
import LabelColorPicker from './LabelColorPicker'
import { Modal } from './ui'
import { inputClass, primaryButtonClass, secondaryButtonClass } from './ui-classes'

export default function LabelManagerDialog({ onClose }: { onClose: () => void }) {
  const labels = useLinksStore((state) => state.labels)
  const labelColors = useLinksStore((state) => state.labelColors)
  const stats = useLinksStore((state) => state.stats)
  const createLabel = useLinksStore((state) => state.createLabel)
  const renameLabel = useLinksStore((state) => state.renameLabel)
  const mergeLabel = useLinksStore((state) => state.mergeLabel)
  const deleteLabel = useLinksStore((state) => state.deleteLabel)
  const setLabelColor = useLinksStore((state) => state.setLabelColor)

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [merging, setMerging] = useState<string | null>(null)
  const [mergeTarget, setMergeTarget] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [coloring, setColoring] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Renaming to an existing name silently merges every link; require consent.
  const [confirmRename, setConfirmRename] = useState<string | null>(null)

  const run = async (action: () => Promise<IpcResult<string[]>>): Promise<boolean> => {
    setBusy(true)
    const result = await action()
    setBusy(false)
    return result.ok
  }

  const addLabel = async (): Promise<void> => {
    if (!(await run(() => createLabel(newName)))) return
    if (newColor) await setLabelColor(normalizeLabelName(newName), newColor)
    setNewName('')
    setNewColor(null)
  }

  return (
    <>
      <Modal title="Manage labels" onClose={onClose}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-md border border-subtle p-2">
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="New label name"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => void addLabel()}
                disabled={busy || newName.trim().length === 0}
                className={primaryButtonClass}
              >
                Add
              </button>
            </div>
            <div className="flex flex-col gap-1 px-1">
              <span className="text-xs text-muted">Color</span>
              <LabelColorPicker label={newName} selected={newColor} onSelect={setNewColor} />
            </div>
          </div>

          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {labels.map((name) => {
              const locked = isProtectedLabel(name)

              if (renaming === name) {
                return (
                  <li key={name} className="rounded-md border border-subtle p-2">
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
                          const target = normalizeLabelName(renameValue)
                          if (target !== name && labels.includes(target)) {
                            setConfirmRename(name)
                            return
                          }
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
                  <li key={name} className="rounded-md border border-subtle p-2">
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
                  className="rounded-md border border-subtle p-2"
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Change color for ${name}`}
                      aria-expanded={coloring === name}
                      onClick={() => setColoring(coloring === name ? null : name)}
                      className={`-m-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition hover:bg-hover ${
                        coloring === name ? 'bg-hover' : ''
                      }`}
                    >
                      <span
                        className="h-3 w-3 rounded-full ring-1 ring-inset ring-black/10"
                        style={{ backgroundColor: labelColor(name, labelColors) }}
                      />
                    </button>
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
                          className="text-xs text-danger transition hover:brightness-125"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                  {coloring === name ? (
                    <div className="mt-2 flex flex-col gap-2 border-t border-subtle pt-3">
                      <LabelColorPicker
                        label={name}
                        selected={labelColors[name] ?? null}
                        onSelect={async (color) => {
                          await setLabelColor(name, color)
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setColoring(null)}
                        className="self-end text-xs text-muted transition hover:text-primary"
                      >
                        Done
                      </button>
                    </div>
                  ) : null}
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

      {confirmRename ? (
        <ConfirmDialog
          title="Merge labels"
          message={`"${normalizeLabelName(renameValue)}" already exists. Renaming "${confirmRename}" moves all of its links into it.`}
          confirmLabel="Merge"
          onCancel={() => setConfirmRename(null)}
          onConfirm={async () => {
            const source = confirmRename
            setConfirmRename(null)
            if (await run(() => renameLabel(source, renameValue))) setRenaming(null)
          }}
        />
      ) : null}
    </>
  )
}
