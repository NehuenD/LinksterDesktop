import { useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_QUICK_CAPTURE_ACCELERATOR, acceleratorFromEvent, formatAccelerator } from '@shared/lib/hotkey'
import type { AppInfo, ThemeMode } from '@shared/contract/ipc'
import ImportDialog from '../components/ImportDialog'
import LabelManagerDialog from '../components/LabelManagerDialog'
import RestoreDialog from '../components/RestoreDialog'
import { api } from '../lib/api'
import { useClipboardStore } from '../store/clipboard-store'
import { useLinksStore } from '../store/links-store'
import { useSettingsStore } from '../store/settings-store'
import { useThemeStore } from '../store/theme-store'
import { useUiStore } from '../store/ui-store'

const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark']

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="edge-highlight rounded-lg border border-subtle bg-raised p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
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
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-md px-2 py-1.5 text-left transition hover:bg-hover/50"
    >
      <span>
        <span className="block text-xs text-primary">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted">{description}</span>
        ) : null}
      </span>
      <span
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? 'bg-accent' : 'bg-strong'
        }`}
      >
        <span
          className={`h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-3' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}

function ShortcutRecorder({
  value,
  onCommit
}: {
  value: string
  onCommit: (accelerator: string) => void
}) {
  const [recording, setRecording] = useState(false)

  return (
    <button
      type="button"
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(event) => {
        if (!recording) return
        event.preventDefault()
        if (event.key === 'Escape') {
          setRecording(false)
          return
        }
        const parts = acceleratorFromEvent(event)
        if (!parts) return
        onCommit(formatAccelerator(parts))
        setRecording(false)
      }}
      className={`rounded-md border px-3 py-1.5 font-mono text-xs transition ${
        recording
          ? 'border-accent/60 bg-accent/10 text-primary'
          : 'border-subtle bg-raised text-primary hover:border-strong hover:bg-hover'
      }`}
    >
      {recording ? 'Press a shortcut…' : value}
    </button>
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
  const reading = useSettingsStore((state) => state.reading)
  const loadReading = useSettingsStore((state) => state.loadReading)
  const setReading = useSettingsStore((state) => state.setReading)
  const notificationPermission = useSettingsStore((state) => state.notificationPermission)
  const loadNotificationPermission = useSettingsStore(
    (state) => state.loadNotificationPermission
  )
  const requestNotificationPermission = useSettingsStore(
    (state) => state.requestNotificationPermission
  )
  const quickCapture = useSettingsStore((state) => state.quickCapture)
  const loadQuickCapture = useSettingsStore((state) => state.loadQuickCapture)
  const setQuickCapture = useSettingsStore((state) => state.setQuickCapture)
  const exportLinks = useSettingsStore((state) => state.exportLinks)
  const copyAll = useSettingsStore((state) => state.copyAll)
  const backup = useSettingsStore((state) => state.backup)
  const loadBackup = useSettingsStore((state) => state.loadBackup)
  const setBackup = useSettingsStore((state) => state.setBackup)
  const pickBackupFolder = useSettingsStore((state) => state.pickBackupFolder)
  const createBackup = useSettingsStore((state) => state.createBackup)
  const labels = useLinksStore((state) => state.labels)

  const [info, setInfo] = useState<AppInfo | null>(null)
  const [managingLabels, setManagingLabels] = useState(false)
  const [importing, setImporting] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [includeBackupContent, setIncludeBackupContent] = useState(true)

  useEffect(() => {
    void loadSettings()
    void loadReading()
    void loadNotificationPermission()
    void loadClipboard()
    void loadQuickCapture()
    void loadBackup()
    void api.system.getAppInfo().then((result) => {
      if (result.ok) setInfo(result.data)
    })
  }, [
    loadSettings,
    loadReading,
    loadNotificationPermission,
    loadClipboard,
    loadQuickCapture,
    loadBackup
  ])

  const buttonClass =
    'rounded-md border border-subtle bg-raised px-3 py-1.5 text-xs text-primary transition hover:border-strong hover:bg-hover active:scale-[0.98]'

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface text-primary">
      <header className="flex items-center gap-3 border-b border-subtle px-4 py-2.5">
        <button
          type="button"
          onClick={() => setView('library')}
          className="text-xs text-muted transition hover:text-primary"
        >
          ← Library
        </button>
        <span className="h-3 w-px bg-subtle" />
        <h1 className="font-display text-sm font-semibold tracking-tight">Settings</h1>
      </header>

      <div className="grid gap-3 overflow-y-auto p-4 md:grid-cols-2">
        <Section title="Appearance">
          <div className="flex gap-0.5 rounded-md border border-subtle bg-surface p-0.5">
            {THEME_MODES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => void setMode(value)}
                aria-pressed={mode === value}
                className={`flex-1 rounded px-2 py-1.5 text-xs capitalize transition ${
                  mode === value
                    ? 'bg-hover font-medium text-primary'
                    : 'text-muted hover:text-primary'
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

        <Section title="Quick capture">
          <Toggle
            label="Global quick-capture shortcut"
            description={
              quickCapture.enabled
                ? `Press ${quickCapture.accelerator} from any app`
                : 'Shortcut disabled'
            }
            checked={quickCapture.enabled}
            onChange={(value) => void setQuickCapture({ enabled: value })}
          />

          <div className="mt-2 flex items-center justify-between gap-4 rounded-md px-2 py-1.5">
            <span className="text-xs text-primary">Shortcut</span>
            <ShortcutRecorder
              value={quickCapture.accelerator}
              onCommit={(accelerator) => void setQuickCapture({ accelerator })}
            />
          </div>

          {quickCapture.error ? (
            <div
              role="alert"
              className="mt-2 flex items-start justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2"
            >
              <span className="text-xs leading-relaxed text-danger">
                {quickCapture.error}
                {quickCapture.registered && quickCapture.accelerator !== DEFAULT_QUICK_CAPTURE_ACCELERATOR
                  ? ' The previous shortcut is still active.'
                  : ''}
              </span>
              <button
                type="button"
                onClick={() =>
                  void setQuickCapture({ accelerator: DEFAULT_QUICK_CAPTURE_ACCELERATOR })
                }
                className="shrink-0 rounded-md border border-danger/40 px-2 py-1 text-xs text-danger transition hover:bg-danger/20"
              >
                Reset
              </button>
            </div>
          ) : null}
        </Section>

        <Section title="Reading">
          <Toggle
            label="Mark links read when opened"
            description="Opening a link marks it read, unless it is archived."
            checked={reading.markReadOnOpen}
            onChange={(value) => void setReading({ markReadOnOpen: value })}
          />
        </Section>

        <Section title="Notifications">
          <Toggle
            label="Notify when a link is captured"
            checked={notifications.notifyOnLinkCapture}
            onChange={(value) => {
              void setNotifications({ notifyOnLinkCapture: value })
              if (value) void requestNotificationPermission()
            }}
          />
          <Toggle
            label="Notify when a screenshot is detected"
            checked={notifications.notifyOnScreenshot}
            onChange={(value) => {
              void setNotifications({ notifyOnScreenshot: value })
              if (value) void requestNotificationPermission()
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-subtle px-2 pt-3">
            <span className="text-xs text-muted">
              {notificationPermission === 'unsupported'
                ? 'System notifications are unavailable on this platform.'
                : 'System notifications are enabled — the OS may ask for permission the first time.'}
            </span>
            {notificationPermission === 'granted' ? (
              <button
                type="button"
                className={buttonClass}
                onClick={() => void requestNotificationPermission()}
              >
                Send test
              </button>
            ) : null}
          </div>
        </Section>

        <Section title="Data">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={buttonClass} onClick={() => setManagingLabels(true)}>
              Manage labels ({labels.length})
            </button>
            <button type="button" className={buttonClass} onClick={() => void exportLinks('json')}>
              Export JSON
            </button>
            <button type="button" className={buttonClass} onClick={() => void exportLinks('csv')}>
              Export CSV
            </button>
            <button type="button" className={buttonClass} onClick={() => void copyAll()}>
              Copy all links
            </button>
            <button type="button" className={buttonClass} onClick={() => setImporting(true)}>
              Import…
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={backingUp}
              onClick={() => {
                setBackingUp(true)
                void createBackup(includeBackupContent).finally(() => setBackingUp(false))
              }}
            >
              {backingUp ? 'Backing up…' : 'Back up now'}
            </button>
            <button type="button" className={buttonClass} onClick={() => setRestoring(true)}>
              Restore…
            </button>
          </div>
          <div className="mt-2">
            <Toggle
              label="Include article content in backups"
              description="Full reader bodies make backups larger but restore offline reading."
              checked={includeBackupContent}
              onChange={setIncludeBackupContent}
            />
          </div>
        </Section>

        <Section title="Auto-backup">
          <Toggle
            label="Back up automatically"
            description="Writes a full backup to the chosen folder on a schedule."
            checked={backup.enabled}
            onChange={(value) => void setBackup({ enabled: value })}
          />
          {backup.enabled ? (
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted">Folder</span>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-mono text-xs text-primary">
                    {backup.folder ?? 'Documents/Linkster'}
                  </span>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => void pickBackupFolder()}
                  >
                    Choose…
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted">Every (days)</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={backup.intervalDays}
                  onChange={(event) =>
                    void setBackup({ intervalDays: Math.max(1, Number(event.target.value) || 1) })
                  }
                  className="w-20 rounded-md border border-subtle bg-raised px-2 py-1 text-right text-xs"
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted">Keep (backups)</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={backup.retention}
                  onChange={(event) =>
                    void setBackup({ retention: Math.max(1, Number(event.target.value) || 1) })
                  }
                  className="w-20 rounded-md border border-subtle bg-raised px-2 py-1 text-right text-xs"
                />
              </div>
              <p className="text-xs text-muted">
                {backup.lastBackupAt
                  ? `Last backup ${new Date(backup.lastBackupAt).toLocaleString()}`
                  : 'No backup yet.'}
              </p>
            </div>
          ) : null}
        </Section>

        <Section title="About">
          <p className="font-mono text-xs text-muted">
            Linkster {info?.version ?? '—'}
            {info ? ` · Electron ${info.electron} · ${info.platform}/${info.arch}` : ''}
          </p>
        </Section>
      </div>

      {managingLabels ? <LabelManagerDialog onClose={() => setManagingLabels(false)} /> : null}
      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}
      {restoring ? <RestoreDialog onClose={() => setRestoring(false)} /> : null}
    </div>
  )
}
