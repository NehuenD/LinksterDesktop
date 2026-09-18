import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_LABEL, type QuickCaptureContext } from '@shared/contract/ipc'
import LabelPicker from '../components/LabelPicker'
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui-classes'
import { api } from '../lib/api'

type Message = { kind: 'success' | 'error' | 'info'; text: string }

export default function QuickCaptureOverlay() {
  const [url, setUrl] = useState('')
  const [initialUrl, setInitialUrl] = useState('')
  const [label, setLabel] = useState(DEFAULT_LABEL)
  const [defaultLabel, setDefaultLabel] = useState(DEFAULT_LABEL)
  const [note, setNote] = useState('')
  const [labels, setLabels] = useState<string[]>([DEFAULT_LABEL])
  const [message, setMessage] = useState<Message | null>(null)
  const [busy, setBusy] = useState(false)

  const applyContext = useCallback((context: QuickCaptureContext) => {
    const nextUrl = context.clipboardUrl ?? ''
    setUrl(nextUrl)
    setInitialUrl(nextUrl)
    setLabel(context.defaultLabel)
    setDefaultLabel(context.defaultLabel)
    setNote('')
    setMessage(null)
    setBusy(false)
  }, [])

  useEffect(() => {
    const unsubscribe = api.quickCapture.onContext(applyContext)
    void api.quickCapture.getContext().then((result) => {
      if (result.ok) applyContext(result.data)
    })
    void api.labels.list().then((result) => {
      if (result.ok && result.data.length > 0) setLabels(result.data)
    })
    return unsubscribe
  }, [applyContext])

  const dirty = url !== initialUrl || label !== defaultLabel || note.trim().length > 0

  useEffect(() => {
    void api.quickCapture.setDirty(dirty)
  }, [dirty])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void api.quickCapture.hide()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const save = async (): Promise<void> => {
    if (busy || url.trim().length === 0) return
    setBusy(true)
    setMessage(null)

    const result = await api.links.quickCreate({
      url,
      label,
      note: note.trim().length > 0 ? note.trim() : null
    })

    if (!result.ok) {
      setBusy(false)
      setMessage({ kind: 'error', text: result.error.message })
      return
    }

    const outcome = result.data
    if (outcome.outcome === 'saved' || outcome.outcome === 'queued') {
      setMessage({
        kind: 'success',
        text: outcome.outcome === 'saved' ? 'Saved to your library' : 'Saved offline — will sync'
      })
      setTimeout(() => void api.quickCapture.hide(), 600)
      return
    }

    setBusy(false)
    setMessage({ kind: outcome.outcome === 'invalid' ? 'error' : 'info', text: outcome.message })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      className="flex h-screen w-screen flex-col gap-2.5 border border-strong bg-panel p-4 text-primary shadow-panel"
    >
      <header className="flex items-center justify-between">
        <h1 className="font-display text-sm font-semibold tracking-tight">Quick capture</h1>
        <span className="text-xs uppercase tracking-[0.14em] text-muted">Esc to close</span>
      </header>

      <input
        autoFocus
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://example.com"
        aria-label="URL"
        className={inputClass}
      />

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <LabelPicker value={label} labels={labels} onChange={setLabel} />
        </div>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add a note (optional)"
          aria-label="Note"
          maxLength={2000}
          className={inputClass}
        />
      </div>

      {message ? (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`text-xs ${
            message.kind === 'error'
              ? 'text-danger'
              : message.kind === 'success'
                ? 'text-emerald-400'
                : 'text-muted'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="mt-auto flex justify-end gap-2">
        <button
          type="button"
          onClick={() => void api.quickCapture.hide()}
          className={secondaryButtonClass}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || url.trim().length === 0}
          className={primaryButtonClass}
        >
          Save
        </button>
      </div>
    </form>
  )
}
