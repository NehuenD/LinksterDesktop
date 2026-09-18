# Spec: Import & Full Backup/Restore Interoperability

> **Status:** Implemented — all 5 tracer bullets complete (2026-09-15), typecheck/lint/228 unit tests green
> **Feature:** 5 of 5 in `Features.md` (Priority: Medium · Effort: M)
> **Source of truth:** `Features.md` §5 (rationale, proposed behavior, acceptance criteria), verified against the current implementation
> **Language/format:** English / Markdown
> **Depends on / touches:** `services/data-export-service`, `services/export-format`, `data/link-repository`, `data/url-normalizer`, `store/store`, `services/settings-service`, IPC contract, preload, renderer `SettingsScreen` + `settings-store`

---

## 1. Goal & Rationale

Data portability today is **one-way and read-only**. `data-export-service.ts:12` (`exportLinks`) and `export-format.ts` write timestamped JSON/CSV into `Documents/Linkster`, but there is **no import** and **no backup/restore**. Consequences:

- **Hard to adopt** — a user with hundreds of browser bookmarks or a Pocket/Instapaper/Raindrop library has no migration path into Linkster.
- **No recovery path** — there is no way to reconstruct links, labels, colors, or reader content after account loss, a bad bulk action, or (per Feature 1) a silent capture failure.
- Export is metadata-only (`export-format.ts:3-15` covers title/description/thumbnail/label/flags/dates); it does **not** include reader content (`link_content`, migration `0003`), label colors, settings, or a schema version — so it cannot serve as a restore artifact.

**Definition of success:** Linkster is both a viable destination (import from browser bookmarks and common read-later services) and a safe home (a single, versioned, verifiable backup that restores links, labels, colors, reader content, and non-secret settings — merging by default, never silently overwriting).

## 2. Scope

**In scope**
- **Browser bookmark import** — Chrome/Edge/Firefox bookmark HTML export; folder nesting → `label`, with dedupe and progress.
- **Service import** — Pocket / Instapaper / Raindrop CSV (and Raindrop JSON) exports mapped onto the Linkster model (`title`/`url`/`tags`/`created`/`read`/`archive`).
- **Full backup** — one versioned archive containing links, labels, label colors, reader content, and non-secret settings, with a manifest.
- **Restore** — validate + merge by default (add new, skip existing), with an explicit **replace** option; report added/skipped/conflicted counts and rehydrate reader content.
- **Idempotent, resumable, observable, cancellable** imports/restores with streamed progress.
- **Scheduled auto-backup** to a chosen folder with a retention count.
- Pure, unit-testable parsers and mappers (`csv`, `bookmarks-html-parser`, `import-mapper`, `backup-format`).

**Out of scope**
- Re-fetching metadata / extracting reader content for imported links (no network fetch on import — see §3.9).
- Archive **encryption** (documented as a risk/follow-up, §7).
- Moving off Supabase as the source of truth; server-to-server sync.
- Binary backup formats (a ZIP container is a possible future evolution, §6.1).
- Restoring `authSession`/credentials (never export secrets — §3.6).
- Feature 2/3/4 surfaces (reader, quick-capture, smart organization).

## 3. Architectural Seams

### 3.1 Formats & file model

One content type, two directions:

| Artifact | Extension | Written by | Read by |
|---|---|---|---|
| Flat export (today) | `.json` / `.csv` | `data-export-service` | humans, other tools |
| **Full backup** (new) | `.json` | `backup-service` | `backup-service` restore |
| Bookmarks | `.html` | browser | `bookmarks-html-parser` |
| Pocket/Instapaper/Raindrop | `.csv` (Raindrop also `.json`) | service | `csv` + `import-mapper` |

**Backup file shape** (`backup-format.ts`, pure, zod-validated):

```ts
export const BACKUP_FORMAT_VERSION = 1

export interface BackupManifest {
  app: 'linkster'
  formatVersion: number
  createdAt: string          // ISO-8601
  appVersion: string         // app.getVersion()
  counts: { links: number; labels: number; contents: number }
}

export interface BackupFile {
  manifest: BackupManifest
  labels: string[]
  labelColors: LabelColors
  settings: BackupSettings   // non-secret subset only (§3.6)
  links: BackupLink[]        // Link fields incl. note/read/archive/createdAt
  contents: BackupContent[]  // link_content rows keyed by linkId
}

export interface BackupSettings {
  themeMode: ThemeMode
  clipboardMonitoring: boolean
  notifyOnLinkCapture: boolean
  notifyOnScreenshot: boolean
  quickCaptureEnabled: boolean
  quickCaptureHotkey: string
}

export function serializeBackup(file: BackupFile): string
export function parseBackup(raw: string): { ok: true; file: BackupFile } | { ok: false; error: string }
```

`parseBackup` rejects unknown `formatVersion`, a non-`linkster` manifest, and malformed shapes — restore never trusts the file.

### 3.2 Pure parsers & mappers

- `src/main/services/csv.ts` — RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF, embedded newlines). No new dependency.
- `src/main/services/bookmarks-html-parser.ts` — tolerant Netscape-bookmark parser. Tracks `<DL>`/`<DT>` nesting and `<H3>` folder names with an explicit stack (Netscape HTML is malformed/optional-close, so a hand-rolled stack is more reliable than DOM parsing); emits `{ title, url, folderPath }`. Uses no network.
- `src/main/services/import-mapper.ts` — normalizes each source row to a common record:

```ts
export type ImportSource = 'bookmarks-html' | 'pocket' | 'instapaper' | 'raindrop' | 'linkster-backup'

export interface ImportRecord {
  url: string
  title: string | null
  label: string             // nearest folder (bookmarks) or first tag (services), else DEFAULT_LABEL
  isRead: boolean
  isArchived: boolean
  createdAt: string | null  // ISO-8601 when the source provides it
  source: ImportSource
}

export function detectSource(fileName: string, head: string): ImportSource | 'auto'
export function mapBookmarks(records: BookmarkEntry[]): ImportRecord[]
export function mapPocket(rows: CsvRow[], options: ImportOptions): ImportRecord[]
export function mapInstapaper(rows: CsvRow[], options: ImportOptions): ImportRecord[]
export function mapRaindrop(json: unknown, options: ImportOptions): ImportRecord[]
```

`ImportRecord` is validated (`validateUrl` + `normalizeUrl`) and invalid rows are dropped and counted, never thrown.

### 3.3 Write path (`src/main/data/link-repository.ts`)

Imports/restores bypass the single-item capture path (Feature 1 outbox fetches metadata; imports already carry metadata) but reuse `normalizeUrl` for dedupe and the existing uniqueness guard `uq_links_user_url_normalized` (`0001_hardening.sql:105`).

New repository functions (all additive):

```ts
/** Paged set of the user's existing dedupe keys, for preview + idempotent re-runs. */
export async function listAllNormalizedUrls(): Promise<Set<string>>

/** Chunked insert of already-mapped records. Returns per-chunk outcomes. */
export async function bulkInsertLinks(
  records: readonly NewLinkRecord[],
  onProgress: (chunk: BulkChunkResult) => void,
  signal: AbortSignal
): Promise<BulkInsertSummary>

export interface NewLinkRecord extends CreateLinkInput {
  id?: string            // preserved on restore when free
  label: string
  isRead: boolean
  isArchived: boolean
  createdAt?: string     // preserved import/restore timestamp
}

/** All content rows for backup (paged). */
export async function listAllLinkContents(): Promise<
  Array<LinkContentRow & { link_id: string }>
>
```

Rules:
- Chunk size ~200; insert via a single `insert([...])` per chunk (`createLink` stays untouched for the capture path).
- A `23505` unique violation inside a chunk triggers a **per-row fallback** for that chunk: insert one-by-one, counting `added` / `skipped`; the run never aborts on a duplicate (AC2).
- `signal.aborted` stops before the next chunk; committed chunks remain (resumable, non-corrupting — AC5).
- `createdAt` is written only when present; otherwise the DB default applies.

### 3.4 Import service (`src/main/services/import-service.ts`)

```ts
export interface ImportOptions {
  source: ImportSource | 'auto'
  defaultLabel?: string        // fallback when a record has no folder/tag
  skipDuplicates: boolean      // default true
}

export interface ImportPreview {
  source: ImportSource
  path: string
  total: number
  duplicates: number           // already present by normalized URL
  invalid: number
  sample: Array<Pick<ImportRecord, 'title' | 'url' | 'label'>>  // first 10
}

export interface ImportProgress {
  phase: 'parsing' | 'writing' | 'done'
  processed: number
  total: number
  added: number
  skipped: number
  failed: number
}

export interface ImportSummary extends ImportProgress {
  source: ImportSource
  duplicates: number
  invalid: number
  cancelled: boolean
}

export async function pickImportFile(): Promise<string | null>          // dialog.showOpenDialog
export async function previewImport(path: string): Promise<ImportPreview>
export async function runImport(path: string, options: ImportOptions): Promise<ImportSummary>
export function cancelImport(): void                                     // aborts the active job
```

Flow: `pick` (dialog) → `preview` (parse + dedupe against `listAllNormalizedUrls()`, no writes) → user confirms → `runImport`:
1. parse → `ImportRecord[]`;
2. collect labels → `ensureLabel` each (batched, deduped);
3. `bulkInsertLinks` with progress broadcast (`IPC.data.importProgress`) after each chunk;
4. summary.

One import job at a time (module-scoped `AbortController`); `cancelImport` aborts the current run.

### 3.5 Backup & restore service (`src/main/services/backup-service.ts`)

```ts
export interface BackupResult {
  path: string
  counts: { links: number; labels: number; contents: number }
  bytes: number
}
export interface RestorePreview { path: string; manifest: BackupManifest; newLinks: number; conflicts: number }
export type RestoreMode = 'merge' | 'replace'
export interface RestoreSummary {
  mode: RestoreMode
  total: number
  added: number
  skipped: number
  conflicted: number
  labels: number
  contents: number
}

export async function createBackup(targetDir?: string): Promise<BackupResult>
export async function pickBackupFile(): Promise<string | null>
export async function previewRestore(path: string): Promise<RestorePreview>
export async function runRestore(path: string, mode: RestoreMode): Promise<RestoreSummary>
export function defaultBackupDirectory(): string
```

`createBackup`:
- gather `listAllLinks()`, `listAllLabels()` (`label-repository.listLabels`), `store.get('labelColors')` (`label-color-service.getLabelColors`), the §3.6 settings subset, and `listAllLinkContents()`;
- build a `BackupFile` with a manifest and write `linkster-backup-<timestamp>.json` to the target folder (default `Documents/Linkster`, matching `data-export-service.ts:14`);
- reader content is included **by default**, with an `includeContent` toggle to keep archives small (§6.5).

`previewRestore` validates via `parseBackup` and counts new (`normalizedUrl` not in `listAllNormalizedUrls()`) vs conflicts.

`runRestore`:
- **merge (default):** insert only records whose `normalizedUrl` is absent; existing rows are untouched (their local read/archive/label win). Preserve backup `id` when free, else mint a new id and remap that link's content.
- **replace (explicit):** for conflicting normalized URLs, update metadata/label/read/archive from the backup via the existing `bulkUpdateLinks`/`updateLink` seam; ids stay stable.
- `ensureLabel` every backup label, then `upsertLinkContent` for each content row mapped to its final server id.
- Never deletes. Future/unknown `formatVersion` is rejected with an actionable error.

### 3.6 Secrets — never backed up

`AppStoreSchema` (`store/store.ts:6-16`) holds `authSession` (`StoredSecrets`). The backup whitelists only non-secret keys (the `BackupSettings` above). `authSession`, and any future credential/token key, is **never** serialized. A unit test asserts the serialized backup contains no session/token fields.

### 3.7 Scheduled auto-backup (`src/main/services/backup-scheduler.ts`)

Follows the main-process timer pattern used elsewhere (`screenshot-service.ts` startup from `index.ts:127`):

```ts
export function startBackupScheduler(): void   // called from app.whenReady
export function stopBackupScheduler(): void    // app 'will-quit'
```

- Store keys (additive): `backupEnabled: boolean` (default **false**), `backupFolder?: string`, `backupIntervalDays: number` (default 7), `backupRetention: number` (default 5), `lastBackupAt?: string`.
- A coarse hourly tick checks `lastBackupAt`; when due and online, runs `createBackup()` then prunes older `linkster-backup-*.json` beyond `backupRetention` in the folder.
- Failures are swallowed to a single log/warning; auto-backup never blocks startup or capture.

### 3.8 IPC contract (`src/shared/contract/ipc.ts`, `preload/index.ts`, handlers)

```
data:import-pick       → { path: string } | null
data:import-preview    (path)                       → ImportPreview
data:import-run        (path, options)              → ImportSummary
data:import-cancel     → true
data:import-progress   → push (ImportProgress)
data:backup-create     (options?)                   → BackupResult
data:backup-restore-pick                            → { path: string } | null
data:backup-restore-preview (path)                  → RestorePreview
data:backup-restore    (path, mode)                 → RestoreSummary
data:backup-settings-get                            → BackupSettings (ui)
settings:get-backup                                 → BackupSettings
settings:set-backup    (patch)                      → BackupSettings
```

- All request/response channels use `IpcResult<T>`; bodies zod-validated (`ImportOptionsSchema`, `RestoreModeSchema`, `BackupSettingsPatchSchema`).
- Preload additions on `api.data`: `importPick`, `importPreview`, `importRun`, `importCancel`, `onImportProgress`, `backupCreate`, `backupRestorePick`, `backupRestorePreview`, `backupRestore`; and `api.settings.getBackup`/`setBackup`.
- New handler logic extends `src/main/ipc/handlers/data.ts` and `handlers/settings.ts` (registered in `ipc/index.ts`).

### 3.9 No network fetch on import

Import deliberately does **not** fetch pages or extract reader content (the SSRF/private-IP prerequisite in `Features.md` therefore does not block this feature). Imported links carry source metadata only and show the normal metadata-only state; background enrichment is a documented follow-up.

### 3.10 Renderer

- `settings-store.ts`: add `importJob: ImportProgress | null`, `importPreview`, `backupSettings`, `restoreSummary` plus `pickImport/previewImport/runImport/cancelImport`, `createBackup`, `pickBackupRestore/runRestore`, `loadBackupSettings/setBackupSettings`; subscribe to `onImportProgress`.
- `SettingsScreen.tsx` **Data** section (`SettingsScreen.tsx:236-251`) gains, reusing `ui.tsx` primitives:
  - **Import…** button → `ImportDialog`: file → auto-detected source (overridable select) → preview (total / duplicates / invalid + sample) → options (default label, skip duplicates) → progress bar with **Cancel** → summary (`added/skipped/conflicted`).
  - **Back up now** + **Restore…** buttons; restore shows the manifest (counts/date) and a **merge vs replace** radio (merge default) before confirming.
  - **Auto-backup** block: toggle, folder picker, interval, retention.
- No new global route; everything lives in the existing Settings surface.

## 4. Acceptance Criteria

| # | Criterion | Verified by |
|---|---|---|
| AC1 | Importing a Chrome/Edge/Firefox bookmarks HTML file creates links with folder-derived labels. | Slice 1 parser + mapper tests |
| AC2 | Re-running the same import does not create duplicates (dedupe by normalized URL). | Slice 1 `bulkInsertLinks` + preview test |
| AC3 | Pocket/Instapaper/Raindrop exports map title/url/tags/read/archive correctly. | Slice 2 mapper tests |
| AC4 | A full backup restores on a fresh install, recovering links, labels, colors, and content. | Slice 4 restore test + manual |
| AC5 | Import/restore show progress and cancel without corrupting existing data. | Slice 2 progress/cancel test |
| AC6 | Restore merges by default and reports added/skipped/conflicted counts. | Slice 4 restore-mode test |

## 5. Tracer Bullet Breakdown

Each slice is a vertical end-to-end cut that is demonstrably working before the next begins.

### Slice 1 — Bookmarks HTML import end-to-end
`csv.ts` + `bookmarks-html-parser.ts` (pure); `import-mapper.ts` (bookmarks) + `ImportRecord`/`ImportPreview`/`ImportSummary` types; `listAllNormalizedUrls` + `bulkInsertLinks` (chunked, per-row fallback, `AbortSignal`) in `link-repository.ts`; `import-service.ts` (`pick`/`preview`/`run`); `data:import-*` IPC + preload; `ImportDialog` + Data-section button; progress via `data:import-progress`.
**Done when:** a Chrome/Firefox bookmarks HTML file imports with folder-derived labels, shows progress, and re-running it adds zero duplicates (AC1, AC2).

### Slice 2 — Service imports (Pocket / Instapaper / Raindrop) + cancel
`mapPocket` / `mapInstapaper` / `mapRaindrop` + `detectSource` (extension + header sniff); `createdAt`/`isRead`/`isArchived`/tags→label plumbing through `NewLinkRecord`; source override select in the dialog; `cancelImport` wired to **Cancel**; summary counts.
**Done when:** each service export maps fields correctly, an invalid/duplicate row is skipped not fatal, and Cancel stops the run mid-chunk leaving prior rows intact (AC3, AC5).

### Slice 3 — Full backup with manifest + reader content
`backup-format.ts` (`BackupFile`, zod `parseBackup`, `serializeBackup`, secret-exclusion); `listAllLinkContents`; `backup-service.createBackup` (links + labels + colors + non-secret settings + content, `includeContent` toggle); `data:backup-create` + preload + **Back up now** button with result toast.
**Done when:** a backup JSON is produced with a valid manifest, includes `link_content`, and a test proves no session/token fields are present.

### Slice 4 — Restore (merge default, replace explicit, content rehydration)
`BackupFileSchema` validation; `previewRestore` (new vs conflicts); `runRestore` for `merge`/`replace`; preserved/fallback ids with content remapping; `ensureLabel` + `upsertLinkContent`; `RestoreSummary`; `data:backup-restore*` IPC + restore dialog (manifest + mode radio).
**Done when:** restoring onto a fresh account recovers links, labels, colors and reader content; default merge leaves existing rows untouched and reports added/skipped/conflicted (AC4, AC6).

### Slice 5 — Scheduled auto-backup + retention
`store` keys; `backup-scheduler.ts` (hourly tick, due check, retention pruning); start/stop in `index.ts`; `settings:get-backup`/`set-backup` + Auto-backup UI.
**Done when:** with auto-backup enabled at a short interval, a backup is written and older files beyond retention are pruned; leaving it disabled does nothing (opt-in).

## 6. Decisions (to confirm with the user)

1. **Backup container = a single versioned `.json` file** (no new dependency). Reader HTML/text is embedded inline; a ZIP container (would require `archiver`/`adm-zip`) and Supabase Storage for large bodies are deferred. `formatVersion` gates future migration.
2. **Tags → a single label.** Linkster's model has one `label` per link, so the **first tag / nearest folder** becomes the label (`DEFAULT_LABEL` when absent). Importing multiple tags as extra labels is not done in v1.
3. **Restore default = `merge` (add new, skip existing); `replace` is explicit.** Local read/archive/label always win under merge; `replace` overwrites metadata for conflicting normalized URLs. No deletes ever.
4. **Auto-backup is opt-in (default off)**, default interval 7 days, retention 5; backups go to `Documents/Linkster` unless a folder is chosen.
5. **Reader content is included by default**, with an `includeContent` toggle for small archives; large-backup warnings are surfaced.
6. **Import does not fetch metadata or extract content** and therefore is unaffected by the SSRF prerequisite; enrichment is a follow-up.
7. **No secrets in backups** — only the whitelisted non-secret settings; `authSession` is explicitly excluded and unit-tested.

## 7. Risks

- **Tags lossy (one label per link):** users with rich tag sets lose secondary tags; keep the raw source file re-importable and document the mapping.
- **CSV/format drift:** Pocket/Instapaper/Raindrop column names change across versions/exports; mappers must be tolerant (header-sniffed, unknown columns ignored) and versioned.
- **Large backup size:** article HTML inline can produce tens of MB; mitigated by `includeContent`, a size warning, and future object/zip support. `listAllLinks` already pages (`link-repository.ts:113`); content paging must likewise avoid PostgREST row caps.
- **Restore id collisions:** restoring into the *same* account can collide on primary keys; fall back to a new id and remap content (covered by `merge`).
- **Partial import/restore:** a crash mid-run leaves committed chunks. This is safe (idempotent by normalized URL) but the summary must report cancellation, and the UI should hint that re-running resumes.
- **`created_at` on insert:** writing an explicit `created_at` may be blocked or overridden by DB defaults/triggers; verify against the hosted schema and fall back to default ordering if rejected.
- **Secrets leakage:** any future credential key must be added to the exclusion test, not just the serializer.
- **Scheduled backup storm:** a coarse tick plus `lastBackupAt` prevents duplicate runs; keep it best-effort and non-blocking.
- **Concurrent import + capture:** both write `links`; rely on `uq_links_user_url_normalized` and per-row fallback rather than app-level locks.

## 8. Test Surface

- `tests/unit/csv.test.ts` — quoted fields, escaped quotes, CRLF, embedded newlines, ragged rows.
- `tests/unit/bookmarks-html-parser.test.ts` — nested folders → label, malformed/optional-close tags, entities, no `<A>` rows.
- `tests/unit/import-mapper.test.ts` — `detectSource`, Pocket/Instapaper/Raindrop field mapping, tags→label, invalid-row dropping.
- `tests/unit/backup-format.test.ts` — manifest round-trip, `formatVersion` rejection, secret exclusion (no `authSession`/token fields).
- `tests/unit/import-dedupe.test.ts` — `bulkInsertLinks` chunking, `23505` per-row fallback, `AbortSignal` stops before the next chunk.
- `tests/unit/export-format.test.ts` (extend) — unchanged flat export remains stable.
- Manual: end-to-end bookmark import from a real browser export; backup → wipe → restore on a fresh account; auto-backup with a short interval; cancel mid-import (AC1–AC6).
