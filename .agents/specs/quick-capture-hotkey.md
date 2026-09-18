# Spec: Global Quick-Capture Hotkey & Capture Overlay

> **Status:** Implemented — all tracer bullets complete (2026-09-15)
> **Feature:** 3 of 5 in `Features.md` (Priority: Medium · Effort: S–M)
> **Source of truth:** `Features.md` §3 (rationale, proposed behavior, acceptance criteria), verified against the current implementation
> **Language/format:** English / Markdown
> **Depends on / touches:** Electron `globalShortcut` + `screen`, `settings-service`, `store` schema, `capture-service` (Feature 1 outbox), `data/outbox-repository`, `data/link-repository` / `link-mapper`, IPC contract, preload, renderer (new `quick-capture` entry + `LabelPicker` + `SettingsScreen`)

---

## 1. Goal & Rationale

Capture today is **passive**: the user must copy a URL in another app and wait for the clipboard watcher (native event, or up to `POLL_INTERVAL_MS ≈ 1.3s` on Linux polling). There is no way to *deliberately* save a URL, add context, or pick a label without first switching to Linkster — and the main window is normally hidden to the tray (`index.ts:40-50`).

**Definition of success:** a system-wide shortcut opens a compact capture overlay over whatever app the user is in; it pre-fills a clipboard URL or accepts a typed one; the user can attach an optional **note** and a **label** and save end-to-end through the *same* validation / dedup / outbox path as clipboard capture — with duplicate and shortcut-conflict states surfaced, never swallowed.

## 2. Scope

**In scope**
- A configurable **global shortcut** (default `CommandOrControl+Shift+L`) that toggles a compact, always-on-top **capture overlay** window near the cursor.
- Overlay that **pre-fills the clipboard URL** when the clipboard holds a valid URL, else focuses a URL field.
- Optional **note** field (new `note` attribute on links) and a **label** picker (reuse `LabelPicker`).
- Save (Enter) / Cancel (Esc); saving routes through `prepareCapture` + outbox drain (Feature 1) so there is **one capture code path**.
- Clear overlay feedback for **duplicate**, **already-queued**, **invalid**, **saved**, and **queued (offline)** outcomes.
- **Shortcut registration failure is visible** in Settings with an actionable warning and a user-configurable accelerator.
- Pure, unit-testable modules for accelerator normalization and outcome mapping.

**Out of scope**
- Import / backup / reader / smart-organization (Features 2, 4, 5).
- Changing the clipboard watcher itself.
- A tray menu entry or a menu-bar item for quick capture.
- Rich note formatting or per-link reminders.
- Global OS-level shortcut conflict resolution beyond letting the user pick another accelerator.
- Restoring focus to the previously active application after the overlay hides (platform limitation — see §7).

## 3. Architectural Seams

### 3.0 Architecture decision — separate overlay window

`Features.md` §3 offers "a small frameless `BrowserWindow` … or a route in the existing window". A **separate window** is chosen because the main window is hidden to the tray (`index.ts:41-45`) and cannot be partially surfaced without showing the whole library, and because the shortcut must work while the main window is hidden. The overlay is **pre-warmed hidden** at startup so first show is fast (AC1) — this adds a second `BrowserWindow`, which requires a documented update to the single-window e2e assertion (see §5 Slice 1 and §6).

### 3.1 Accelerator normalization (`src/shared/lib/hotkey.ts`, pure, shared)

One module builds and validates accelerator strings for both processes (renderer records keys, main registers).

```ts
export interface AcceleratorParts {
  commandOrControl: boolean
  shift: boolean
  alt: boolean
  key: string // normalized main key: 'L', 'F5', 'Space', ...
}

export const DEFAULT_QUICK_CAPTURE_ACCELERATOR = 'CommandOrControl+Shift+L'

/** Maps a KeyboardEvent to parts, or null when the key cannot be an accelerator main key. */
export function acceleratorFromEvent(event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}): AcceleratorParts | null

/** Requires ≥1 modifier + a valid main key; emits Electron's canonical order. */
export function formatAccelerator(parts: AcceleratorParts): string

/** Structural check for settings input; does not prove the OS will accept it. */
export function isValidAccelerator(accelerator: string): boolean
```

Rules: at least one of `CommandOrControl | Shift | Alt`; main key is a single letter/digit, `F1`–`F24`, or a named key (`Space`, `Enter`, `Tab`, `Home`, `End`, `Up`…); emit `CommandOrControl+Shift+<Key>`. `Ctrl`/`Cmd` both collapse to `CommandOrControl` (matches `Features.md` default and `index.ts` conventions).

### 3.2 Global shortcut service (`src/main/services/hotkey-service.ts`)

Owns `globalShortcut` registration and exposes registration status so Settings can render a warning (AC5).

```ts
export interface QuickCaptureSettings {
  enabled: boolean
  accelerator: string
  registered: boolean          // false when the OS/app binding is taken
  error: string | null         // human-readable reason when !registered
}

export function getQuickCaptureSettings(): QuickCaptureSettings
export function applyQuickCaptureSettings(
  patch: { enabled?: boolean; accelerator?: string }
): QuickCaptureSettings
export function applyStoredQuickCapturePreference(): void   // called from app.whenReady
export function disposeQuickCaptureHotkey(): void           // app 'will-quit'
```

Behavior:
- `globalShortcut.register(accelerator, toggleQuickCaptureOverlay)` returns `false` on conflict — set `registered: false` + `error: 'Shortcut unavailable — it may be used by another app.'` and continue (no crash).
- Changing the accelerator: **unregister the previous, attempt the new**; if it fails, re-register the previous so the feature keeps working, but report the failure for the value the user typed.
- `enabled: false` → unregister and clear registration state.
- Registration order: call in `app.whenReady` **after** `registerIpcHandlers()`; dispose in `app.on('will-quit')`.
- Platform note: Electron `globalShortcut` is unreliable under Linux/Wayland — surface the same "unavailable" warning rather than silently failing.

### 3.3 Overlay window (`src/main/windows/quick-capture-window.ts`)

```ts
export function prewarmQuickCaptureOverlay(): void      // create hidden at startup
export function showQuickCaptureOverlay(): void
export function hideQuickCaptureOverlay(): void
export function toggleQuickCaptureOverlay(): void
export function isQuickCaptureOverlayVisible(): boolean
export function destroyQuickCaptureOverlay(): void
```

Window options (mirror `main-window.ts:7-24` web preferences):

```ts
new BrowserWindow({
  width: 440, height: 236, show: false, frame: false, resizable: false,
  movable: true, minimizable: false, maximizable: false, fullscreenable: false,
  skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#08080a',
  webPreferences: { preload: <same index.mjs>, sandbox: false, contextIsolation: true,
                    nodeIntegration: false }
})
```

- Loads the **new** `quick-capture.html` entry (dev: `ELECTRON_RENDERER_URL/quick-capture.html`; prod: built file).
- **Positioning** on show: `screen.getCursorScreenPoint()` → `screen.getDisplayNearestPoint()` → center horizontally under the cursor, 12px below it, clamped to the display `workArea`.
- **Show/focus**: `show()` + `focus()` (typing is required; focus stealing is accepted — see §7). `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` on macOS.
- **Hide**: on `blur`, **guarded** by (a) a `suppressBlurHide` flag set while showing/DevTools are open and while a save is in-flight, and (b) a renderer-reported **dirty** flag — the renderer sends `quick-capture:set-dirty` when the URL/note/label differ from the prefilled values, and a dirty overlay is **not** blur-hidden (it stays until Esc/Cancel). Also hides on Esc/Cancel (renderer → `quickCapture:hide`) and after a successful save.
- **Context push** on every show: read `clipboard.readText()`, run `validateUrl`; if valid, send `IPC.quickCapture.context` with `{ clipboardUrl, defaultLabel: DEFAULT_LABEL }`. Invalid/empty → `clipboardUrl: null` (renderer focuses the URL field).
- `toggling` while visible hides; a single overlay instance is reused.
- Excluded from the main window's close-to-tray logic; destroyed on `will-quit`.

### 3.4 Note attribute — data model

A user-authored note must survive an offline capture, so it travels with the outbox and is persisted on the link.

**Migration `supabase/migrations/0004_link_note.sql`**

```sql
alter table public.links add column if not exists note text;
```

Rationale: small field, user-authored, belongs in `links` (syncs via the existing realtime publication, appears in list payloads). Alternative (JSON attributes column) is not used.

Plumbing (all additive):
- `Link` gains `note: string | null`; `CreateLinkInputSchema` and `UpdateLinkPatchSchema` gain `note: z.string().nullable().optional()`.
- `LinkRow` + `mapLinkRow` map `note`; `LINK_COLUMNS` (`link-repository.ts:22-23`) includes `note`.
- `buildLinkUpdatePayload` (`link-mapper.ts:96-108`) writes `note`.
- `createLink` (`link-repository.ts:152-170`) inserts `note`.
- `OutboxItem` gains `note?: string | null`; `EnqueueInput` gains `note?: string | null`; `OUTBOX_SCHEMA_VERSION` → `2` with a tolerant `load()` that defaults legacy items to `note: null` (additive optional field; no destructive migration).
- Drain (`capture-service.ts:126-140`) passes `item.note ?? null` into `createLink`.
- `undoDelete` (`links-store.ts:307-322`) re-creates with `note`.

### 3.5 Capture path — `quickCapture` orchestration (`src/main/services/capture-service.ts`)

Extend the Feature 1 pipeline rather than adding a second write path:

```ts
export interface CaptureOptions { label?: string; note?: string | null }

// Existing signature is widened; the clipboard caller is unaffected.
export async function prepareCapture(
  rawUrl: string,
  options: CaptureOptions = {}
): Promise<PrepareResult>

export type QuickCaptureOutcome =
  | { outcome: 'saved'; label: string }
  | { outcome: 'queued'; label: string }
  | { outcome: 'pending'; message: string }
  | { outcome: 'duplicate'; message: string }
  | { outcome: 'invalid'; message: string }

export async function quickCapture(
  rawUrl: string,
  options: CaptureOptions = {}
): Promise<QuickCaptureOutcome>
```

- `PrepareResult`'s rejection arm gains a discriminant so the overlay can distinguish states without string matching:
  ```ts
  | { accepted: false; retryable: boolean; code: 'invalid' | 'duplicate'; reason: string }
  ```
- `quickCapture`: `prepareCapture` → `invalid` / `duplicate` / `pending` (`alreadyPending`); on a new enqueue call `drainOutbox()`, then `outboxRepository.get(item.id) === null ? 'saved' : 'queued'`. `prepareCapture` never throws on network, so exceptions map to `queued`.
- Mapping is a **pure helper** (`toQuickCaptureOutcome`) so it is unit-testable without Electron/Supabase.
- Dedup, validation, label creation and retry all remain Feature 1 behavior (AC6).

### 3.6 IPC contract (`src/shared/contract/ipc.ts`, `preload/index.ts`, handlers)

```
links:quick-create (input) → QuickCaptureOutcome          // typed/annotated capture
settings:get-quick-capture → QuickCaptureSettings
settings:set-quick-capture (patch) → QuickCaptureSettings
quick-capture:get-context → QuickCaptureContext           // initial fallback
quick-capture:context → push                              // sent on every overlay show
quick-capture:set-dirty (dirty: boolean) → true           // gates blur-hide
quick-capture:hide → true
```

```ts
export interface QuickCaptureInput {
  url: string
  label?: string
  note?: string | null
}

export interface QuickCaptureContext {
  clipboardUrl: string | null
  defaultLabel: string
}

export interface QuickCaptureSettings {
  enabled: boolean
  accelerator: string
  registered: boolean
  error: string | null
}
```

- `QuickCaptureInputSchema = z.object({ url: z.string(), label: z.string().optional(), note: z.string().max(2000).nullable().optional() })`.
- All request/response channels use `IpcResult<T>`; `settings:set-quick-capture` validates the accelerator via `isValidAccelerator` before applying.
- Preload additions: `api.links.quickCreate`, `api.settings.getQuickCapture` / `setQuickCapture`, and a new `api.quickCapture = { getContext, hide, setDirty, onContext }` namespace (`IPC.quickCapture`).
- New handler file `src/main/ipc/handlers/quick-capture.ts` registered in `ipc/index.ts`; settings handlers extend `handlers/settings.ts`.

### 3.7 Settings store & service

`AppStoreSchema` (`store/store.ts:5-13`) gains:

```ts
quickCaptureEnabled: boolean      // default true
quickCaptureAccelerator: string   // default DEFAULT_QUICK_CAPTURE_ACCELERATOR
```

`settings-service.ts` gains `getQuickCaptureSettings()` / `setQuickCaptureSettings(patch)`, delegating registration to `hotkey-service` and persisting `enabled`/`accelerator` in the store.

### 3.8 Renderer — overlay entry (`src/renderer/quick-capture.html` + `src/renderer/src/quick-capture/`)

- **New HTML entry** with the same CSP as `index.html:4-9`, mounting `quick-capture/main.tsx`; add a second rollup input in `electron.vite.config.ts` renderer build:
  ```ts
  input: { index: resolve('src/renderer/index.html'),
           quickCapture: resolve('src/renderer/quick-capture.html') }
  ```
- `quick-capture/main.tsx` imports the shared `styles.css` (Tailwind already scans `src`) and renders `QuickCaptureOverlay` in `StrictMode`.
- `QuickCaptureOverlay.tsx`:
  - On mount: `api.quickCapture.onContext(apply)` + `api.quickCapture.getContext()` fallback; `api.labels.list()` for the picker (failure → `[General]`).
  - Fields: URL input (autofocus when `clipboardUrl === null`), **Note** textarea (2 rows), **Label** via `LabelPicker` (`components/LabelPicker.tsx`).
  - Footer: Cancel (Esc) / **Save** (Enter). Save disabled when the URL is empty; the overlay does not re-implement URL validation (main is authoritative).
  - Result handling: `saved` / `queued` → inline success then `api.quickCapture.hide()` (`queued` shows "Saved offline — will sync"); `duplicate` / `pending` / `invalid` → inline message, overlay stays open for correction; `IpcResult` failure → inline error.
  - Global `keydown`: Enter submits, Esc hides; `blur` guard left to main.
  - Styling reuses `ui.tsx`, `ui-classes.ts`, and the theme tokens so it matches the app in dark/light.

### 3.9 Renderer — Settings ("Quick capture" section, `SettingsScreen.tsx`)

- Toggle: enable/disable quick capture (reuse the `Toggle` primitive).
- **Shortcut recorder**: a focused input captures `keydown`, builds parts via `acceleratorFromEvent`, and renders the formatted accelerator; requires ≥1 modifier. On change → `setQuickCapture({ accelerator })`; on failure the stored value is kept and the warning shows.
- **Warning**: when `registered === false`, render an actionable `role="alert"` box with `error` and a **Reset to default** button (AC5); when `enabled === false`, show an informational line.
- Settings store (`settings-store.ts`) gains `quickCapture`, `loadQuickCapture()`, `setQuickCapture(patch)`.

### 3.10 Note surfacing (minimal)

- `EditLinkDialog.tsx` gains a **Note** field, saved through the existing `updateLink` patch.
- `AddLinkDialog.tsx` gains the same **Note** field, but keeps its existing **`links:create`** path (metadata-only, no fetch/outbox) — `CreateLinkInputSchema`/`createLink` already accept `note` from §3.4.
- `ReaderView.tsx` renders the link note under the title when present.
- No card redesign; `note` is not shown in the grid in v1.

## 4. Acceptance Criteria

| # | Criterion | Verified by |
|---|---|---|
| AC1 | Pressing the shortcut from any app opens the overlay in <300ms. | Slice 1 manual + prewarm timing; e2e window check |
| AC2 | A clipboard URL is pre-filled and Enter saves it end-to-end. | Slice 1 prefill + Slice 2 quick-create test |
| AC3 | A typed URL can be saved with a note and label without touching the main window. | Slice 2 overlay + note persistence test |
| AC4 | Duplicate URLs are detected and reported in the overlay. | Slice 2 outcome-mapping unit test + manual |
| AC5 | If the shortcut is unavailable, Settings shows an actionable warning. | Slice 3 hotkey-service test + manual |
| AC6 | Quick-captured links obey the same validation/dedup rules as clipboard capture. | Slice 2 handler test (routes through `prepareCapture`) |

## 5. Tracer Bullet Breakdown

Each slice is a vertical end-to-end cut that is demonstrably working before the next begins.

### Slice 1 — Shortcut opens a pre-warmed overlay with clipboard prefill
`src/shared/lib/hotkey.ts` (default accelerator); `hotkey-service.ts` register/unregister; `quick-capture-window.ts` (prewarm, position, show/hide/toggle, guarded blur + Esc + dirty flag); `quick-capture.html` + overlay entry + minimal `QuickCaptureOverlay` (URL input, prefill from `quick-capture:context`, Cancel/Esc); vite multi-entry; `app.whenReady` prewarm + registration; `will-quit` disposal; e2e smoke updated to assert the **main** window (visible-window count) rather than total windows.
**Done when:** pressing the shortcut from another app shows the overlay in <300ms with a valid clipboard URL pre-filled, Esc hides it, and blur hides only when the input is untouched (AC1, AC2 groundwork).

### Slice 2 — Note + label + quick-create through the outbox
Migration `0004_link_note.sql`; `note` through `Link` / `CreateLinkInput` / `UpdateLinkPatch` / `link-mapper` / `LINK_COLUMNS`; `OutboxItem`/`EnqueueInput` note + schema v2; `prepareCapture` options and `PrepareResult.code`; `quickCapture` + pure `toQuickCaptureOutcome`; `links:quick-create` handler; preload `links.quickCreate`; overlay note field, `LabelPicker`, Enter-to-save, result messaging, hide-on-success; `EditLinkDialog` + `AddLinkDialog` + `ReaderView` note display; `undoDelete` note.
**Done when:** a typed URL saves end-to-end with a note and label from the overlay while the main window stays hidden (AC3); a duplicate shows "Already in your library", an already-queued URL shows "Already queued", and an offline save reports "Saved offline — will sync" (AC4, AC6); the note persists and survives an offline restart (Slice 1 outbox test extended).

### Slice 3 — Configurable shortcut + conflict visibility
`store` schema + `settings-service` quick-capture getters/setters; `settings:get-quick-capture` / `settings:set-quick-capture`; renderer settings store; Settings "Quick capture" section with toggle, shortcut recorder and `role="alert"` warning + Reset to default; re-registration on change and on `enabled` toggle.
**Done when:** the accelerator can be changed and persists across restart; a taken/invalid accelerator keeps the previous binding working **and** shows the actionable warning with Reset (AC5).

## 6. Decisions (confirmed 2026-09-15)

1. **Separate, pre-warmed overlay window.** A separate `BrowserWindow` (not a main-window route) is required to capture while the main window is hidden to tray, and it is **pre-warmed hidden at startup** to hit the <300ms budget. Because a hidden `BrowserWindow` is still returned by `BrowserWindow.getAllWindows()`, `tests/e2e/smoke.spec.ts:25` changes from `expect(app.windows()).toHaveLength(1)` to assert exactly one **visible** window (the main window). This is the only edited existing test.
2. **Blur-hide with an unsaved-input guard.** Blur hides the overlay **unless** a save is in-flight, DevTools are focused, or the input is dirty; a dirty overlay stays until Esc/Cancel. Renderer reports dirtiness via `quick-capture:set-dirty`; main owns the `suppressBlurHide` flag.
3. **Note stored as `links.note`** (migration `0004`, nullable) and carried in the **outbox** so an offline note is never lost. Rejected: JSON attributes column (less discoverable, harder to update/query).
4. **Note surfacing = Edit dialog + Reader only.** `EditLinkDialog` and `AddLinkDialog` gain a Note field; `ReaderView` shows it under the title. No grid/card changes in v1.
5. **`AddLinkDialog` stays on `links:create`.** It remains the metadata-only insert (no fetch / no outbox); only its new Note field is additive. The overlay is the annotated capture path.
6. **Quick capture is available before sign-in.** Because the write path is offline-first (Feature 1), an unauthenticated capture enqueues and syncs after auth; the label list falls back to `General`. This keeps the shortcut always functional.
7. **Shortcut conflict policy:** keep the requested accelerator stored, report `registered:false` + `error`, and offer **Reset to default**; the previous working binding is restored on a failed change (`globalShortcut` is best-effort — under Linux/Wayland the warning is the fallback).
8. **Default accelerator = `CommandOrControl+Shift+L`**, normalized through `src/shared/lib/hotkey.ts`.
9. **No focus restoration.** The overlay steals focus (required for typing); returning focus to the previous app is not attempted in v1.
10. **Overlay appears near the cursor.** `screen.getCursorScreenPoint()` → `getDisplayNearestPoint()`, clamped to the display `workArea`; no centered mode in v1.
11. **`prepareCapture` rejects carry a `code`** (`'invalid' | 'duplicate'`) so the overlay maps outcomes without brittle string comparisons; the existing clipboard caller is unaffected.
12. **Overlay does not re-validate URLs.** Main/final validation is authoritative; the overlay only requires a non-empty URL.

## 7. Risks

- **OS/app shortcut conflicts** are common for `Ctrl/Cmd+Shift+L`; the feature must degrade to a warning and stay user-configurable (AC5). `Features.md` §3 flags this.
- **Linux/Wayland**: `globalShortcut` may not register at all; the Settings warning is the only signal. Document as a known limitation.
- **macOS focus/activation**: showing the overlay steals focus from the user's app and focus is not restored; `setVisibleOnAllWorkspaces` + `visibleOnFullScreen` may behave differently across macOS versions.
- **Blur-hide over-eagerness**: DevTools focus or a slow save can hide the overlay mid-edit; guarded by `suppressBlurHide` and by not hiding while a save is in flight.
- **e2e invariant change**: pre-warming alters the single-window assumption; keep the updated assertion focused on visible windows to preserve its intent.
- **Multi-monitor / DPI**: cursor-based positioning must clamp to the nearest display's `workArea`; validate on scaled displays.
- **Prewarm cost**: a second idle renderer uses memory for the whole session; acceptable for the latency budget, revisit if the app targets low-memory devices.
- **Pre-auth capture**: queueing before sign-in relies on Feature 1's drain-after-auth; an outbox soft cap (`offline-capture-outbox.md` §7) applies if many pre-auth captures accumulate.
- **`note` payload**: bounded to 2000 chars (schema) to avoid bloating `links` realtime payloads.

## 8. Test Surface

- `tests/unit/hotkey.test.ts` — `acceleratorFromEvent` (modifier requirement, ignored keys), `formatAccelerator` canonical order, `isValidAccelerator`.
- `tests/unit/quick-capture-outcome.test.ts` — pure `toQuickCaptureOutcome` mapping for `saved`/`queued`/`pending`/`duplicate`/`invalid`.
- `tests/unit/outbox-repository.test.ts` (extend) — `note` persists through enqueue → re-open; legacy items default to `note: null` (schema v2).
- `tests/unit/link-mapper.test.ts` (extend) — `note` round-trips in `mapLinkRow` and `buildLinkUpdatePayload`.
- `tests/unit/contract.test.ts` (extend, optional) — `QuickCaptureInputSchema` accepts/notes bounds.
- `tests/e2e/smoke.spec.ts` (edit) — exactly one **visible** window at boot (prewarmed overlay hidden).
- Manual/OS checks: shortcut conflict warning, Linux/Wayland behavior, multi-display positioning, overlay latency (AC1).
