import { useState } from 'react'
import { DEFAULT_LABEL, type Link } from '@shared/contract/ipc'
import { useLinksStore } from '../store/links-store'
import { Field, Modal } from './ui'
import { inputClass, primaryButtonClass, secondaryButtonClass } from './ui-classes'

export default function EditLinkDialog({ link, onClose }: { link: Link; onClose: () => void }) {
  const updateLink = useLinksStore((state) => state.updateLink)
  const refreshMetadata = useLinksStore((state) => state.refreshMetadata)
  const labels = useLinksStore((state) => state.labels)

  const [url, setUrl] = useState(link.url)
  const [title, setTitle] = useState(link.title ?? '')
  const [description, setDescription] = useState(link.description ?? '')
  const [label, setLabel] = useState(link.label)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    setError(null)
    const result = await updateLink(link.id, {
      url,
      title: title.trim().length > 0 ? title.trim() : null,
      description: description.trim().length > 0 ? description.trim() : null,
      label: label.trim().length > 0 ? label : DEFAULT_LABEL
    })
    setBusy(false)
    if (result.ok) {
      onClose()
    } else {
      setError(result.error.message)
    }
  }

  const refresh = async () => {
    setBusy(true)
    setError(null)
    const result = await refreshMetadata(link.id)
    setBusy(false)
    if (result.ok) {
      setTitle(result.data.title ?? '')
      setDescription(result.data.description ?? '')
    } else {
      setError(result.error.message)
    }
  }

  return (
    <Modal title="Edit link" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="URL">
          <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Description">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Label">
          <input
            list="edit-label-options"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={DEFAULT_LABEL}
            className={inputClass}
          />
          <datalist id="edit-label-options">
            {labels.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>

        {error ? (
          <p role="alert" className="text-sm text-accent">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className={secondaryButtonClass}
          >
            Refresh metadata
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className={primaryButtonClass}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
