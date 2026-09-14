import type { LinkFilter, ThemeMode } from '@shared/contract/ipc'
import { labelColor } from '@shared/lib/label-color'
import { useAuthStore } from '../store/auth-store'
import { useLinksStore } from '../store/links-store'
import { useThemeStore } from '../store/theme-store'

const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark']

interface NavButtonProps {
  active: boolean
  label: string
  count: number
  onClick: () => void
}

function NavButton({ active, label, count, onClick }: NavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
        active ? 'bg-raised text-primary' : 'text-muted hover:bg-hover'
      }`}
    >
      <span>{label}</span>
      <span className="text-xs text-muted">{count}</span>
    </button>
  )
}

export default function Sidebar() {
  const stats = useLinksStore((state) => state.stats)
  const labels = useLinksStore((state) => state.labels)
  const filter = useLinksStore((state) => state.filter)
  const selectedLabel = useLinksStore((state) => state.selectedLabel)
  const setFilter = useLinksStore((state) => state.setFilter)
  const setLabel = useLinksStore((state) => state.setLabel)
  const user = useAuthStore((state) => state.user)
  const signOut = useAuthStore((state) => state.signOut)
  const mode = useThemeStore((state) => state.mode)
  const setMode = useThemeStore((state) => state.setMode)

  const filters: Array<{ key: LinkFilter; label: string; count: number }> = [
    { key: 'all', label: 'All Links', count: stats.total },
    { key: 'unread', label: 'Unread', count: stats.unread },
    { key: 'archived', label: 'Archived', count: stats.archived }
  ]

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-subtle bg-raised">
      <div className="px-5 py-5">
        <p className="font-display text-lg font-semibold tracking-tight">Linkster</p>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {filters.map((item) => (
          <NavButton
            key={item.key}
            active={filter === item.key}
            label={item.label}
            count={item.count}
            onClick={() => void setFilter(item.key)}
          />
        ))}
      </nav>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-widest text-muted">
          Labels
        </p>
        <div className="flex flex-col gap-1">
          {labels.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => void setLabel(selectedLabel === label ? null : label)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                selectedLabel === label ? 'bg-hover text-primary' : 'text-muted hover:bg-hover'
              }`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: labelColor(label) }}
              />
              <span className="flex-1 truncate text-left">{label}</span>
              <span className="text-xs text-muted">{stats.byLabel[label] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-subtle p-3">
        <div className="mb-2 flex gap-1">
          {THEME_MODES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => void setMode(value)}
              className={`flex-1 rounded-md px-2 py-1 text-xs capitalize transition ${
                mode === value ? 'bg-hover text-primary' : 'text-muted hover:bg-hover'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="truncate text-xs text-muted">{user?.email ?? ''}</span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="shrink-0 text-xs text-muted underline hover:text-primary"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}
