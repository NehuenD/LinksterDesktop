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
    const result = await createLink({ url, label: label.trim().length > 0 ? label : DEFAULT_LABEL })
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
          <input
            list="add-label-options"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={DEFAULT_LABEL}
            className={inputClass}
          />
          <datalist id="add-label-options">
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
