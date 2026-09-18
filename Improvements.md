# Linkster — Proposed Improvements to Existing Features

> **Status:** Proposal — derived from the multi-agent audit (data/IPC, renderer/UX, services/native, quality/security)
> **Date:** 2026-09-15
> **Scope:** Improvements to behavior that already exists (not net-new features — see `Features.md`).
> Each item below is a self-contained work package with evidence, intended behavior, technical
> notes, acceptance criteria, effort, and risks, suitable for lifting into `.agents/specs/`.

---

## Table of contents

1. [Lossless Undo + Complete Triage Controls](#1-lossless-undo--complete-triage-controls)
2. [Correct Read-State and Palette/Search Consistency](#2-correct-read-state-and-palettesearch-consistency)
3. [Security Hardening Pass](#3-security-hardening-pass)
4. [Correctness, Scaling & Cross-Device Consistency](#4-correctness-scaling--cross-device-consistency)
5. [Accessibility & Feedback Polish](#5-accessibility--feedback-polish)

---

## 1. Lossless Undo + Complete Triage Controls

**Priority:** High · **Effort:** M · **Area:** renderer `links-store`, `UndoToast`, `BulkActionBar`, `link-repository`

### Evidence

- `links-store.ts:240-255` — `undoDelete` recreates deleted rows through `links.create` using only
  `url/title/description/thumbnailUrl/label`. The restored links therefore get **new IDs**, a new
  `createdAt`, and lose `isRead`/`isArchived`, reordering the library and discarding state.
- Per-item create failures in the undo loop are ignored (no toast), and `UndoToast.tsx` has **no
  auto-dismiss timer** (unlike `toast-store.ts:23`), so it persists indefinitely and across views.
- Triage is incomplete: `BulkActionBar.tsx:38-44` offers Archive but **no unarchive** and no
  "clear label"; there is no **mark-all-read** and no **sort control** (the store always orders
  newest-first server-side).

### Problem

Undo is the user's safety net for destructive actions, and it silently corrupts the data it
restores. The library is also missing the two most common read-later operations (mark all read,
sort by something other than date).

### Proposed behavior

1. **Preserve identity and state on undo.** A restored link keeps its `id`, `createdAt`,
   `updatedAt`, `isRead`, `isArchived`, `label`, and colors. Implement via soft-delete (a
   `deleted_at`/`is_deleted` tombstone) or a full-row restore payload — not re-creation.
2. **Honest undo feedback.** If any item cannot be restored, show a clear error naming how many
   failed; never fail silently.
3. **Auto-dismissing undo.** The undo bar auto-dismisses after a sensible window (e.g. 6–8s) with a
   visible countdown, and is cleared on view switch.
4. **Complete triage:** add **Mark all as read** (respecting current filters), **Unarchive** bulk
   action, **Clear/Move label** bulk action, and a **sort** selector (newest/oldest/title/domain)
   wired to the server query.
5. **Shift-click range selection** and a "select all matching (not just loaded)" option, since
   `Select all` currently only selects the 48 loaded items (`links-store.ts:268`).

### Technical approach

- Preferred: add `is_deleted boolean`/`deleted_at timestamptz` (migration) and exclude deleted rows
  in `listLinks`/`getLinkStats`; undo flips the flag. This preserves all fields and IDs with no
  payload smuggling.
- Alternative (no schema change): snapshot the full row at delete time in renderer state and add a
  `links:restore` IPC that inserts with explicit id/createdAt/updatedAt. Requires the create path to
  accept those fields (currently `CreateLinkInput` forbids them — `ipc.ts:165-172`).
- Add `sort` to `LinkQuery` (validated with zod) and map to PostgREST `order`.
- Pure selection helpers (`selection.ts`) for range/select-all-matching, unit-tested.
- `UndoToast` gains a timer driven by the store (`lastDeleted.expiresAt`), cleared on view change.

### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | Delete then Undo restores the exact link(s) with original id, createdAt, and read/archive state. |
| AC2 | The restored link returns to its original position in the newest-first list. |
| AC3 | If a restore partially fails, the user sees how many items were not restored. |
| AC4 | The undo bar auto-dismisses and does not persist across view changes. |
| AC5 | Mark-all-read, bulk unarchive, and clear-label work on the current filtered result set. |
| AC6 | Sorting by title/domain/oldest is server-driven and paginates correctly. |

### Risks

- Soft-delete adds a filter to every query and requires careful index/RLS coverage.
- Bulk restore must be atomic enough to avoid partial, confusing states.

---

## 2. Correct Read-State and Palette/Search Consistency

**Priority:** High · **Effort:** S–M · **Area:** renderer `LinkCard`, `CommandPalette`, `HomeScreen`, `FilterBar`, `use-global-shortcuts`

### Evidence

- `LinkCard.tsx:43-47` — clicking a card opens the URL but **never marks it read**; the unread dot
  persists after reading, desynchronizing the library from reality.
- `CommandPalette.tsx:66-75` — the palette fuzzy-searches only the **loaded page** (`links`, first
  48, current filter), while the main search is server-side (`D2`). Most links are unreachable from
  the palette, contradicting its purpose.
- `HomeScreen.tsx:60-63` registers global shortcuts **before** the `settings`/`screenshots` early
  returns (`:83-89`). Pressing `Ctrl/Cmd+K` or `Ctrl/Cmd+N` on those views silently sets state; the
  palette/dialog then pops open unexpectedly when the user returns to the library.
- `FilterBar.tsx:48-59` — "Clear filters" clears domain/date but **not the search term**, which sits
  directly above it, producing a confusing half-cleared state.
- `HomeScreen.tsx:120-122` shows a hardcoded **"Ctrl K"** hint on all platforms even though the
  handler supports `Cmd` (`use-global-shortcuts.ts:22`).

### Problem

These are small, high-frequency correctness bugs that make the app feel unreliable precisely in its
primary reading workflow.

### Proposed behavior

1. Opening a link marks it read (optimistically, then confirmed), unless the link is archived or the
   user has disabled the behavior.
2. The command palette queries the **server** for links (debounced), respecting nothing but the
   query — or at minimum searches all pages — and shows labels/actions as it does today.
3. Global shortcuts are only active on the library view, or they route to a sensible no-op/close
   elsewhere; state set while off-view is not retained.
4. "Clear filters" clears **search + domain + date + status** together (or is relabeled to match
   exactly what it clears).
5. Shortcut hints render platform-correct (`⌘K` on macOS, `Ctrl K` elsewhere).

### Technical approach

- `LinkCard` open handler calls a store action `openLink(link)` that invokes `openExternal` and a
  `links:update` `{ isRead: true }`; guard against archived.
- Add a `search` capability to the palette: either reuse `links-store` server search or a dedicated
  `links:search` IPC with its own debounce; keep actions/labels locally filtered.
- Move `useGlobalShortcuts` inside the library branch (or gate it on `ui-store.view === 'library'`)
  and clear `paletteOpen`/dialog flags when the view changes.
- Extend the clear action to reset `search` too; update `FilterBar` props.
- Derive the hint from `ui-store.platform` (already fetched in `App.tsx`).

### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | Opening an unread link marks it read and updates the unread count without a manual refresh. |
| AC2 | The command palette finds links that are not on the first loaded page. |
| AC3 | `Ctrl/Cmd+K`/`Ctrl/Cmd+N` pressed on Settings or Screenshots do not arm anything for the library. |
| AC4 | "Clear filters" resets search, domain, and date together with a consistent label. |
| AC5 | Shortcut hints show `⌘K` on macOS and `Ctrl K` on Windows/Linux. |

### Risks

- Server palette search adds IPC load; debounce and cap results.
- Auto-mark-read could surprise users who archive-to-read-later; make it a setting.

---

## 3. Security Hardening Pass

**Priority:** High · **Effort:** M · **Area:** `main-window`, `metadata-service`, `url-validator`, `session-storage`, `supabase/migrations`, IPC handlers

### Evidence

- **No RLS policies in the repo.** `0001_hardening.sql:111` assumes policies already exist
  ("already invisible under RLS"), but no `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` exists
  anywhere in `supabase/`. A public anon key is shipped, so per-user isolation depends on
  out-of-repo SQL that cannot be audited or reproduced. This is the top risk.
- **`sandbox: false`** (`main-window.ts:20`) contradicts the spec's required process model
  (`electron-migration.md:40`); no rationale is documented.
- **Unvalidated external open.** `main-window.ts:30-33` calls `shell.openExternal(url)` for any
  scheme from window-open requests, unlike the validated IPC path (`system.ts:38-44`, http(s) only).
  There is no `will-navigate` guard either.
- **SSRF via redirects.** `metadata-service.ts:67` uses `redirect: 'follow'` and never re-validates
  the final URL, so a public URL can redirect the main process to `169.254.169.254`, `127.0.0.1`,
  or RFC1918 hosts. `validateUrl` only runs on the initial string (`:87`).
- **Private-host filter bypass.** `url-validator.ts:29-37` inspects only the first hextet plus
  `::1`/`::`; IPv4-mapped IPv6 (`http://[::ffff:127.0.0.1]/`) and `fec0::/10` slip through.
- **Plaintext session fallback.** `session-storage.ts:39-44` base64-stores the Supabase session
  when `safeStorage` is unavailable (notably Linux without a keyring).
- **Windows file paths accepted as hosts.** `url-validator.ts:21,69-73` turns `C:\...\shot.png`
  into `https://c/...`, so the app's own "copy screenshot path" can be re-captured as a bogus link.

### Goal

Close the audited security holes so user isolation is verifiable in-repo and the process cannot be
tricked into local/private network access or silent insecure storage.

### Proposed behavior / changes

1. **Version the full schema + RLS in `supabase/migrations`.** Add base table DDL (or a documented
   baseline), `ENABLE ROW LEVEL SECURITY`, and explicit per-user policies for `links` and `labels`
   (`user_id = auth.uid()`) covering SELECT/INSERT/UPDATE/DELETE; enforce `UNIQUE(user_id, name)`
   on labels and an `updated_at` trigger. Add `supabase/config.toml` so migrations are reproducible.
2. **Enable `sandbox: true`.** Confirm the built preload has no `require(` and fix if needed;
   document any unavoidable exception.
3. **Validate all external opens.** Route `setWindowOpenHandler` through an http(s)-only check
   (shared helper with `system.ts`), and add a `will-navigate` guard that blocks off-app top-level
   navigation.
4. **Re-validate redirects.** After each hop (or on the final `response.url`), re-run the URL
   validator and abort if it resolves to a private/reserved host; cap redirect count.
5. **Harden host parsing.** Reject IPv4-mapped/site-local IPv6 and non-URL Windows paths before
   normalization (pure, unit-tested against a bypass corpus).
6. **Fail-closed sessions.** When `safeStorage` is unavailable, prefer not to persist refresh tokens
   (or clearly warn) instead of base64-plaintext; document Linux keyring requirements.
7. **Sender-scoped IPC (defense in depth).** Validate the IPC sender is the main window and keep the
   zod boundary on every handler (wrap the few handlers that currently throw, e.g. `system.ts`).

### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | `supabase/migrations` contains reproducible DDL + RLS; a fresh project enforces per-user isolation verified by a test. |
| AC2 | The renderer runs with `sandbox: true, contextIsolation: true, nodeIntegration: false`. |
| AC3 | `window.open`/navigation to a non-http(s) scheme or off-app origin is blocked, not opened. |
| AC4 | A public URL redirecting to `127.0.0.1`/RFC1918/`169.254.169.254` is rejected before any content is read. |
| AC5 | IPv4-mapped IPv6 and site-local IPv6 private addresses are rejected (tests cover the bypasses). |
| AC6 | With no OS keyring, the app does not silently persist session tokens in plaintext. |

### Risks

- Enabling `sandbox` can break preload assumptions; verify against the built bundle in CI.
- RLS migration must not lock out existing users; test backfill on a staging dataset.
- Redirect re-validation can reject legitimate CDN hops; allowlist must be conservative.

---

## 4. Correctness, Scaling & Cross-Device Consistency

**Priority:** Medium-High · **Effort:** M · **Area:** `link-repository`, IPC handlers, `label-color-service`, `auth-store`, `screenshot-service`, `realtime-service`

### Evidence

- **Unbounded stats.** `link-repository.ts:66` fetches all rows to compute
  `total/unread/archived/byLabel` client-side; PostgREST's default row cap silently truncates counts
  for libraries over ~1000 links, and memory/time grow with the library.
- **Inconsistent result envelope.** `system:theme-set` (`system.ts:34-36`), window controls,
  `settings:get-notifications`, `screenshots:get-folder`, and `auth:get-state` do not wrap errors,
  so a zod/throw rejects the invoke instead of returning `{ ok:false }` — breaking the contract.
- **Local-only label colors.** `label-color-service.ts` stores colors in electron-store with no DB
  column, so colors diverge across devices and are not part of any backup.
- **Incomplete sign-out.** `auth-store.ts:24-26` ignores the result and does not clear zustand
  caches (`labelColors`, `lastDeleted`, filters), so AC7's "sign-out clears local caches" is only
  partially met; a failed sign-out is silent.
- **Screenshot thumbnails are serial and full-decode.** `screenshot-service.ts:101-118` `await`s
  `stat` + `nativeImage` decode per file, decoding full-size images one at a time; large galleries
  are slow and memory-heavy, and the listing repeats on every `screenshots:changed`.
- **Realtime has no status handling.** `realtime-service.ts:23-35` subscribes with no status/error
  callback; `isRealtimeActive()` can report `true` for a failed channel, and reconciliation depends
  on RLS scoping.
- **Double refresh on local capture.** `capture-service.ts:50` broadcasts immediately and the DB
  insert's `postgres_changes` triggers a second coalesced broadcast — redundant network/renderer work.
- **Non-atomic search escaping.** `link-repository.ts:17-19,36-39` interpolates `or(ilike...)` with a
  custom escaper whose correctness must track PostgREST parsing.

### Goal

Make counts and labels correct and consistent at scale and across devices, guarantee the IPC
contract, and remove known inefficiencies — without changing user-facing behavior.

### Proposed behavior / changes

1. **Server-side stats.** Add a Postgres RPC (or use `count` with `head: true` + filters) returning
   `total/unread/archived/byLabel` in one call; never fetch all rows to count.
2. **Uniform envelope.** Wrap every IPC handler so all return `IpcResult`; add a regression test that
   asserts no handler rejects.
3. **Sync label colors.** Add a `labels.color` column (migration) and read/write colors through the
   label repository; keep local store only as a cache/fallback.
4. **Complete sign-out.** Clear all zustand stores/modules (labels, colors, selection, undo, filters,
   screenshots) on sign-out and surface failures; cancel realtime on any non-authenticated state
   (`auth-service.ts:38-42` currently only stops on `unauthenticated`).
5. **Parallel, cached thumbnails.** Generate thumbnails with bounded concurrency (e.g. 4), skip
   re-decode when `(path, mtime)` is cached, and consider generating lazily as cards scroll.
6. **Realtime status.** Use the `.subscribe(status => …)` callback; drive UI connection state and
   the offline outbox (Feature 1) from it; coalesce the redundant capture broadcast.
7. **Robust search.** Replace hand-rolled `or(ilike)` interpolation with parameterized RPC/filter
   building and add tests for special characters.

### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | Stats are accurate for a library of 10,000+ links and computed without fetching all rows. |
| AC2 | No IPC handler can reject; every failure returns `{ ok:false, error }` (test-enforced). |
| AC3 | A label color set on device A appears on device B via realtime. |
| AC4 | Sign-out clears label colors, selection, undo, and filters, and reports failure if it occurs. |
| AC5 | A folder with several hundred screenshots renders thumbnails noticeably faster and without UI stalls. |
| AC6 | Realtime connection status is observable and recovers/notifies on disconnect. |

### Risks

- RPC changes need careful RLS interaction (SECURITY DEFINER vs. invoker semantics).
- Label-color migration must backfill/merge existing local colors without data loss.
- Bounded concurrency tuning may need per-machine adjustment.

---

## 5. Accessibility & Feedback Polish

**Priority:** Medium · **Effort:** S–M · **Area:** `ui.tsx`, `CommandPalette`, `ScreenshotsScreen`, `LinkCard`, `HomeScreen`, `Toaster`, `styles.css`, `auth-store`/`LoginScreen`

### Evidence

- **Modals are not dialogs.** `ui.tsx:12-45` has no `role="dialog"`, `aria-modal`, Escape-to-close,
  or focus trap; focus can tab behind the overlay. Only `CommandPalette.tsx:115` handles Escape.
- **Keyboard-invisible actions.** `ScreenshotsScreen.tsx:35` uses `opacity-0 group-hover:opacity-100`
  with no `group-focus-within`, so keyboard users focus buttons they cannot see (LinkCard does this
  correctly at `LinkCard.tsx:109`).
- **Missing ARIA/state.** No `aria-pressed` on the auto-capture pill (`HomeScreen.tsx:125-137`) or
  theme toggles; icon-only "+" relies on surrounding text; most buttons lack visible focus rings.
- **Feedback is inconsistent and duplicated.** Mutations double-report (`links-store.ts:181-182`
  toasts *and* the dialog renders inline text); add/edit/archive/read give no success feedback while
  export/copy/delete do; `loadMore` failures are silent (`links-store.ts:134-146`); label/color load
  failures are silent (`:116-127`); notification permission is never requested.
- **Sign-in can hang.** `auth-store.ts:19-23` stays `loading` until `auth:changed`; abandoning the
  browser leaves the Login button on "Waiting for browser…" (`LoginScreen.tsx:54`).
- **Micro-typography.** Pervasive 10–11px text on a 15px root (`styles.css:62`, `LinkCard.tsx:73-83`)
  is below comfortable readability.
- **Filtered-empty state is not distinguished.** `HomeScreen.tsx:172-176` always shows the
  first-run "Copy a URL…" empty state, even when a filter/search yields nothing, with no "Clear
  filters" CTA.

### Goal

Make the app keyboard- and screen-reader-usable, give consistent and honest feedback for every
action, and improve baseline legibility — without redesigning the visual language.

### Proposed behavior / changes

1. **Accessible `Modal`/dialog primitive.** Add `role="dialog"`, `aria-modal`, labelled title,
   Escape-to-close, focus trap, initial focus, and `aria-labelledby`; use it everywhere (Add/Edit,
   Label manager, confirms, color picker).
2. **Keyboard parity.** Reveal screenshot/ link actions on `group-focus-within`; add visible
   `focus-visible` rings to interactive elements; add `aria-pressed` to toggle buttons.
3. **Consistent feedback.** One clear success/error signal per action (prefer toast for transient,
   inline only for field-specific validation — remove the double report); add success toasts for
   add/edit/archive/read; surface `loadMore` and label/color load failures with retry.
4. **Notification permission.** Request OS permission when the user enables notifications and
   reflect the real permission state in Settings.
5. **Sign-in resilience.** Add a timeout/reset so a hung or abandoned OAuth returns to an actionable
   state with a Retry, rather than staying in `loading`.
6. **Legibility & empty states.** Raise the smallest type (min ~11–12px with better line-height);
   add a distinct "no results for these filters" empty state with a Clear-filters CTA; add brief
   first-run guidance for auto-capture and screenshots.
7. **Deduplicate theme control.** Keep a single canonical theme control (Sidebar **or** Settings) to
   avoid two code paths.

### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | Every modal traps focus, closes on Escape, and is announced as a dialog to assistive tech. |
| AC2 | All interactive controls are reachable and visibly focusable by keyboard, including hover actions. |
| AC3 | Each mutation produces exactly one success or error signal (no double reporting). |
| AC4 | Enabling notifications reflects real OS permission and requests it when needed. |
| AC5 | An abandoned Google sign-in returns to a retryable state instead of hanging on "loading". |
| AC6 | A filtered-empty library shows a distinct state with a working Clear-filters action. |
| AC7 | Body text uses a comfortable minimum size; no persistent 10px text remains in primary flows. |

### Risks

- Focus traps and scroll locking have cross-platform quirks; test on Windows/macOS/Linux.
- Raising font sizes may shift layouts; audit spacing tokens alongside the change.
- Notification permission APIs differ per platform; degrade gracefully.

---

## Suggested sequencing

| Order | Improvement | Why first |
|---|---|---|
| 1 | Security Hardening Pass | Highest risk; unblocks safe content/import work. |
| 2 | Lossless Undo + Triage | Protects users from data loss; quick trust win. |
| 3 | Correct Read-State & Palette/Search | High-frequency correctness; small effort. |
| 4 | Correctness, Scaling & Consistency | Enables scale and cross-device parity. |
| 5 | Accessibility & Feedback Polish | Broad quality lift; low risk once flows are correct. |

> **Note:** Improvements 1 and 4 intersect with `Features.md` #1 (offline outbox) and #2 (reader
> content) — sequence them together where they share schema/merge work.
