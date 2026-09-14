import { useEffect, useState, type ReactNode } from 'react'
import type { AppInfo, ThemeMode } from '@shared/contract/ipc'
import { api } from '../lib/api'
import { useClipboardStore } from '../store/clipboard-store'
import { useLinksStore } from '../store/links-store'
import { useSettingsStore } from '../store/settings-store'
import { useThemeStore } from '../store/theme-store'
import { useUiStore } from '../store/ui-store'
import LabelManagerDialog from '../components/LabelManagerDialog'

const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark']

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-subtle bg-raised p-5">
      <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-muted">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span>
        <span className="block text-sm text-primary">{label}</span>
        {description ? <span className="block text-xs text-muted">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
      />
    </label>
  )
}

export default function SettingsScreen() {
  const setView = useUiStore((state) => state.setView)
  const mode = useThemeStore((state) => state.mode)
  const setMode = useThemeStore((state) => state.setMode)
  const monitoring = useClipboardStore((state) => state.monitoring)
  const native = useClipboardStore((state) => state.native)
  const loadClipboard = useClipboardStore((state) => state.load)
  const setMonitoring = useClipboardStore((state) => state.setMonitoring)
  const notifications = useSettingsStore((state) => state.notifications)
  const loadSettings = useSettingsStore((state) => state.load)
  const setNotifications = useSettingsStore((state) => state.setNotifications)
  const exportLinks = useSettingsStore((state) => state.exportLinks)
  const copyAll = useSettingsStore((state) => state.copyAll)
  const labels = useLinksStore((state) => state.labels)

  const [info, setInfo] = useState<AppInfo | null>(null)
  const [managingLabels, setManagingLabels] = useState(false)

  useEffect(() => {
    void loadSettings()
    void loadClipboard()
    void api.system.getAppInfo().then((result) => {
      if (result.ok) setInfo(result.data)
    })
  }, [loadSettings, loadClipboard])

  const buttonClass =
    'rounded-lg border border-subtle px-4 py-2 text-sm text-primary transition hover:bg-hover'

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-primary">
      <header className="flex items-center gap-4 border-b border-subtle px-6 py-4">
        <button
          type="button"
          onClick={() => setView('library')}
          className="text-sm text-muted transition hover:text-primary"
        >
          ← Library
        </button>
        <h1 className="font-display text-lg font-semibold">Settings</h1>
      </header>

      <div className="grid gap-4 overflow-y-auto p-6 md:grid-cols-2">
        <Section title="Appearance">
          <div className="flex gap-2">
            {THEME_MODES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => void setMode(value)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm capitalize transition ${
                  mode === value ? 'bg-hover text-primary' : 'text-muted hover:bg-hover'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Capture">
          <Toggle
            label="Automatic clipboard capture"
            description={
              native
                ? 'Native event listener active'
                : 'Polling watcher active (native addon unavailable)'
            }
            checked={monitoring}
            onChange={(value) => void setMonitoring(value)}
          />
        </Section>

        <Section title="Notifications">
          <Toggle
            label="Notify when a link is captured"
            checked={notifications.notifyOnLinkCapture}
            onChange={(value) => void setNotifications({ notifyOnLinkCapture: value })}
          />
          <Toggle
            label="Notify when a screenshot is detected"
            checked={notifications.notifyOnScreenshot}
            onChange={(value) => void setNotifications({ notifyOnScreenshot: value })}
          />
        </Section>

        <Section title="Data">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={() => setManagingLabels(true)}>
              Manage labels ({labels.length})
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => void exportLinks('json')}
            >
              Export JSON
            </button>
            <button type="button" className={buttonClass} onClick={() => void exportLinks('csv')}>
              Export CSV
            </button>
            <button type="button" className={buttonClass} onClick={() => void copyAll()}>
              Copy all links
            </button>
          </div>
        </Section>

        <Section title="About">
          <p className="text-sm text-muted">
            Linkster {info?.version ?? '—'}
            {info ? ` · Electron ${info.electron} · ${info.platform}/${info.arch}` : ''}
          </p>
        </Section>
      </div>

      {managingLabels ? <LabelManagerDialog onClose={() => setManagingLabels(false)} /> : null}
    </div>
  )
}
