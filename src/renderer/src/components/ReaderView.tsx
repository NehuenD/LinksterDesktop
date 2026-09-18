import { useEffect, useMemo, useState } from 'react'
import { domainOf } from '@shared/lib/format'
import { openExternal } from '../lib/open-external'
import { sanitizeArticleHtml } from '../lib/sanitize-article'
import { useLinksStore } from '../store/links-store'
import { useReaderStore } from '../store/reader-store'
import { useUiStore } from '../store/ui-store'

function TopButton({
  label,
  onClick,
  title
}: {
  label: string
  onClick: () => void
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className="rounded-md border border-subtle bg-raised px-2 py-1 text-xs text-muted transition hover:border-strong hover:text-primary"
    >
      {label}
    </button>
  )
}

export default function ReaderView({ linkId }: { linkId: string }) {
  const closeReader = useUiStore((state) => state.closeReader)
  const content = useReaderStore((state) => state.content)
  const status = useReaderStore((state) => state.status)
  const error = useReaderStore((state) => state.error)
  const load = useReaderStore((state) => state.load)
  const reset = useReaderStore((state) => state.reset)
  const fontSize = useReaderStore((state) => state.fontSize)
  const maxWidth = useReaderStore((state) => state.maxWidth)
  const setFontSize = useReaderStore((state) => state.setFontSize)
  const refreshMetadata = useLinksStore((state) => state.refreshMetadata)

  const [extracting, setExtracting] = useState(false)

  useEffect(() => {
    void load(linkId)
    return () => reset()
  }, [linkId, load, reset])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeReader()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeReader])

  const html = useMemo(() => {
    if (content?.extractionStatus !== 'ok' || !content.contentHtml) return ''
    return sanitizeArticleHtml(content.contentHtml)
  }, [content])

  const url = content?.url ?? ''
  const domain = url ? domainOf(url) : ''
  const note = content?.note?.trim() ?? ''
  const isArticle = content?.extractionStatus === 'ok' && html.length > 0
  const isMedia = content?.extractionStatus === 'media'
  const canExtract =
    content?.extractionStatus === 'none' ||
    content?.extractionStatus === 'empty' ||
    content?.extractionStatus === 'failed'

  const extract = async () => {
    setExtracting(true)
    await refreshMetadata(linkId)
    await load(linkId)
    setExtracting(false)
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-surface text-primary">
      <header className="flex items-center gap-2 border-b border-subtle px-4 py-2.5">
        <TopButton label="← Library" onClick={closeReader} title="Back to library" />
        <span className="min-w-0 truncate text-xs text-muted">
          {domain}
          {isArticle && content?.readingTimeMinutes
            ? ` · ${content.readingTimeMinutes} min read`
            : ''}
          {content?.fromCache ? ' · offline copy' : ''}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          {isArticle ? (
            <>
              <TopButton
                label="A−"
                title="Smaller text"
                onClick={() => setFontSize(Math.max(13, fontSize - 1))}
              />
              <TopButton
                label="A+"
                title="Larger text"
                onClick={() => setFontSize(Math.min(28, fontSize + 1))}
              />
            </>
          ) : null}
          {url ? (
            <TopButton label="Open original" onClick={() => void openExternal(url)} />
          ) : null}
          <TopButton label="✕" onClick={closeReader} title="Close" />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === 'loading' ? (
          <p className="p-6 text-xs text-muted">Loading…</p>
        ) : status === 'error' ? (
          <p className="m-6 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error ?? 'Could not load this article.'}
          </p>
        ) : !content ? (
          <p className="p-6 text-xs text-muted">Unavailable.</p>
        ) : isArticle ? (
          <div className="mx-auto px-6" style={{ maxWidth: `${maxWidth}px` }}>
            {note ? (
              <p className="mt-6 rounded-md border border-subtle bg-raised px-3 py-2 text-xs text-muted">
                {note}
              </p>
            ) : null}
            <article
              className="reader-article py-8"
              style={{ fontSize: `${fontSize}px` }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        ) : isMedia ? (
          <div className="mx-auto flex flex-col gap-4 px-6 py-8" style={{ maxWidth: `${maxWidth}px` }}>
            {content.thumbnailUrl ? (
              <img
                src={content.thumbnailUrl}
                alt=""
                className="w-full rounded-lg border border-subtle object-cover"
              />
            ) : null}
            <h1 className="font-display text-xl font-semibold leading-tight">
              {content.title ?? domain}
            </h1>
            <p className="text-xs text-muted">
              {[content.author, content.siteName].filter(Boolean).join(' · ')}
            </p>
            {content.description ? (
              <p className="text-sm leading-relaxed text-muted">{content.description}</p>
            ) : null}
            {note ? (
              <p className="rounded-md border border-subtle bg-raised px-3 py-2 text-xs text-muted">
                {note}
              </p>
            ) : null}
            <div>
              <button
                type="button"
                onClick={() => void openExternal(url)}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition hover:brightness-110"
              >
                {content.siteName ? `Watch on ${content.siteName}` : 'Watch'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex flex-col gap-4 px-6 py-8" style={{ maxWidth: `${maxWidth}px` }}>
            <h1 className="font-display text-xl font-semibold leading-tight">
              {content.title ?? domain}
            </h1>
            {content.description ? (
              <p className="text-sm leading-relaxed text-muted">{content.description}</p>
            ) : null}
            {note ? (
              <p className="rounded-md border border-subtle bg-raised px-3 py-2 text-xs text-muted">
                {note}
              </p>
            ) : null}
            <p className="text-xs text-muted">
              No readable content is available for this page.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void openExternal(url)}
                className="rounded-md border border-subtle bg-raised px-3 py-1.5 text-xs transition hover:border-strong"
              >
                Open original
              </button>
              {canExtract ? (
                <button
                  type="button"
                  disabled={extracting}
                  onClick={() => void extract()}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition hover:brightness-110 disabled:opacity-60"
                >
                  {extracting ? 'Extracting…' : 'Extract article'}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
