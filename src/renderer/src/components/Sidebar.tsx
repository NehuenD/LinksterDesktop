import { useState } from 'react'
import type { LinkFilter, ThemeMode } from '@shared/contract/ipc'
import { labelColor } from '@shared/lib/label-color'
import { classifyLinkKind } from '@shared/lib/link-url'
import { useAuthStore } from '../store/auth-store'
import { useLinksStore } from '../store/links-store'
import { useThemeStore } from '../store/theme-store'
import { useUiStore } from '../store/ui-store'
import LabelManagerDialog from './LabelManagerDialog'

const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark']

interface NavButtonProps {
  active: boolean
  label: string
  count: number
  onClick: () => void
  title?: string
}

function NavButton({ active, label, count, onClick, title }: NavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition ${
        active ? 'bg-hover font-medium text-primary' : 'text-muted hover:bg-hover/60 hover:text-primary'
      }`}
    >
      <span>{label}</span>
      <span className="font-mono text-xs tabular-nums text-muted">{count}</span>
    </button>
  )
}

function LinkMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5">
      <path
        d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function Sidebar() {
  const stats = useLinksStore((state) => state.stats)
  // Section captures show their own pending cards; the library badge counts
  // only library-bound captures so it always matches the visible strip.
  const pendingCount = useLinksStore(
    (state) => state.pending.filter((item) => classifyLinkKind(item.url) === 'link').length
  )
  const labels = useLinksStore((state) => state.labels)
  const labelColors = useLinksStore((state) => state.labelColors)
  const filter = useLinksStore((state) => state.filter)
  const selectedLabel = useLinksStore((state) => state.selectedLabel)
  const setFilter = useLinksStore((state) => state.setFilter)
  const setLabel = useLinksStore((state) => state.setLabel)
  const user = useAuthStore((state) => state.user)
  const signOut = useAuthStore((state) => state.signOut)
  const mode = useThemeStore((state) => state.mode)
  const setMode = useThemeStore((state) => state.setMode)
  const view = useUiStore((state) => state.view)
  const setView = useUiStore((state) => state.setView)
  const [managingLabels, setManagingLabels] = useState(false)

  const filters: Array<{ key: LinkFilter; label: string; count: number }> = [
    { key: 'all', label: 'All Links', count: stats.total },
    { key: 'unread', label: 'Unread', count: stats.unread },
    { key: 'archived', label: 'Archived', count: stats.archived }
  ]

  return (
    <>
      <aside className="flex h-full w-56 shrink-0 flex-col border-r border-subtle bg-panel">
        <div className="flex items-center gap-2 px-3 py-3">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent/15 text-accent">
            <LinkMark />
          </span>
          <p className="font-display text-sm font-semibold tracking-tight">Linkster</p>
        </div>

        <nav className="flex flex-col gap-0.5 px-2">
          {filters.map((item) => (
            <NavButton
              key={item.key}
              active={filter === item.key}
              label={item.label}
              count={item.count}
              onClick={() => {
                setView('library')
                void setFilter(item.key)
              }}
            />
          ))}
          {pendingCount > 0 ? (
            <div
              className="mx-0.5 mt-1 flex items-center gap-1.5 rounded-md border border-subtle bg-raised px-2 py-1 text-xs text-muted"
              title="Captures queued locally and waiting to sync"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
              {pendingCount} pending
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setView('screenshots')}
            className="mt-0.5 flex w-full items-center rounded-md px-2.5 py-1.5 text-xs text-muted transition hover:bg-hover/60 hover:text-primary"
          >
            Screenshots
          </button>
          <NavButton
            active={view === 'youtube'}
            label="YouTube"
            count={stats.youtubeUnwatched > 0 ? stats.youtubeUnwatched : stats.youtube}
            title={`${stats.youtubeUnwatched} unwatched of ${stats.youtube}`}
            onClick={() => setView('youtube')}
          />
          <NavButton
            active={view === 'x'}
            label="X Posts"
            count={stats.xPostsUnread > 0 ? stats.xPostsUnread : stats.xPosts}
            title={`${stats.xPostsUnread} unread of ${stats.xPosts}`}
            onClick={() => setView('x')}
          />
        </nav>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-2">
          <div className="flex items-center justify-between px-2.5 pb-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Labels
            </span>
            <button
              type="button"
              onClick={() => setManagingLabels(true)}
              className="text-xs text-muted transition hover:text-primary"
            >
              Manage
            </button>
          </div>
          <div className="flex flex-col gap-0.5">
            {labels.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setView('library')
                  void setLabel(selectedLabel === label ? null : label)
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition ${
                  selectedLabel === label
                    ? 'bg-hover font-medium text-primary'
                    : 'text-muted hover:bg-hover/60 hover:text-primary'
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/20"
                  style={{ backgroundColor: labelColor(label, labelColors) }}
                />
                <span className="flex-1 truncate text-left">{label}</span>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {stats.byLabel[label] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-subtle p-2">
          <button
            type="button"
            onClick={() => setView('settings')}
            className="mb-1.5 w-full rounded-md px-2.5 py-1.5 text-left text-xs text-muted transition hover:bg-hover/60 hover:text-primary"
          >
            Settings
          </button>
          <div className="mb-1.5 flex gap-0.5 rounded-md border border-subtle bg-raised p-0.5">
            {THEME_MODES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => void setMode(value)}
                aria-pressed={mode === value}
                className={`flex-1 rounded px-1.5 py-1 text-xs capitalize transition ${
                  mode === value ? 'bg-hover font-medium text-primary' : 'text-muted hover:text-primary'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 px-1.5">
            <span className="truncate text-xs text-muted">{user?.email ?? ''}</span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="shrink-0 text-xs text-muted transition hover:text-primary"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {managingLabels ? (
        <LabelManagerDialog onClose={() => setManagingLabels(false)} />
      ) : null}
    </>
  )
}
