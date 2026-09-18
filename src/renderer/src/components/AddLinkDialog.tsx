import { useState } from 'react'
import { DEFAULT_LABEL } from '@shared/contract/ipc'
import { useLinksStore } from '../store/links-store'
import LabelPicker from './LabelPicker'
import { Field, Modal } from './ui'
import { inputClass, primaryButtonClass, secondaryButtonClass } from './ui-classes'

export default function AddLinkDialog({ onClose }: { onClose: () => void }) {
  const createLink = useLinksStore((state) => state.createLink)
  const labels = useLinksStore((state) => state.labels)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState(DEFAULT_LABEL)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    const result = await createLink({
      url,
      label: label.trim().length > 0 ? label : DEFAULT_LABEL,
      note: note.trim().length > 0 ? note.trim() : null
    })
    setBusy(false)
    if (result.ok) onClose()
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
          <LabelPicker value={label} labels={labels} onChange={setLabel} />
        </Field>

        <Field label="Note">
          <textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why did you save this?"
            maxLength={2000}
            className={inputClass}
          />
        </Field>

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
