import { useState } from 'react'
import { DEFAULT_LABEL } from '@shared/contract/ipc'
import { useLinksStore } from '../store/links-store'
import { Field, Modal, inputClass, primaryButtonClass, secondaryButtonClass } from './ui'

export default function AddLinkDialog({ onClose }: { onClose: () => void }) {
  const createLink = useLinksStore((state) => state.createLink)
  const labels = useLinksStore((state) => state.labels)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState(DEFAULT_LABEL)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    const result = await createLink({ url, label })
    setBusy(false)
    if (result.ok) {
      onClose()
    } else {
      setError(result.error.message)
    }
  }

  return (
    <Modal title="Add link" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field label="URL">
          <input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com"
            className={inputClass}
          />
        </Field>

        <Field label="Label">
          <select
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className={inputClass}
          >
            {labels.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {labels.includes(label) ? null : <option value={label}>{label}</option>}
          </select>
        </Field>

        {error ? (
          <p role="alert" className="text-sm text-accent">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || url.trim().length === 0}
            className={primaryButtonClass}
          >
            Add link
          </button>
        </div>
      </form>
    </Modal>
  )
}
