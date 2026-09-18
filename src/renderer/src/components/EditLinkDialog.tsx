import { useState } from 'react'
import { DEFAULT_LABEL, type Link } from '@shared/contract/ipc'
import { useLinksStore } from '../store/links-store'
import LabelPicker from './LabelPicker'
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
  const [note, setNote] = useState(link.note ?? '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    const result = await updateLink(link.id, {
      url,
      title: title.trim().length > 0 ? title.trim() : null,
      description: description.trim().length > 0 ? description.trim() : null,
      label: label.trim().length > 0 ? label : DEFAULT_LABEL,
      note: note.trim().length > 0 ? note.trim() : null
    })
    setBusy(false)
    if (result.ok) onClose()
  }

  const refresh = async () => {
    setBusy(true)
    const result = await refreshMetadata(link.id)
    setBusy(false)
    if (result.ok) {
      setTitle(result.data.title ?? '')
      setDescription(result.data.description ?? '')
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
          <LabelPicker value={label} labels={labels} onChange={setLabel} />
        </Field>
        <Field label="Note">
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why did you save this?"
            maxLength={2000}
            className={inputClass}
          />
        </Field>

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
