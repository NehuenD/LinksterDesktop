# Linkster — Proposed New Features

> **Status:** Proposal — derived from the multi-agent audit (data/IPC, renderer/UX, services/native, quality/security)
> **Date:** 2026-09-15
> **Context:** Linkster is a cross-platform Electron read-later app whose defining behavior is
> automatic clipboard URL capture. It stores OpenGraph metadata only, syncs to Supabase, and
> provides a labels/search/bulk/palette library plus a screenshot companion gallery.
>
> This document describes five new, independently shippable features. Each entry follows the
> repo's spec conventions (goal, evidence, scope, behavior, technical approach, acceptance
> criteria, effort, risks) so it can be lifted directly into `.agents/specs/` as a tracer-bullet
> plan.

---

## Table of contents

1. [Offline-First Capture Outbox with Retry & Conflict-Safe Sync](#1-offline-first-capture-outbox-with-retry--conflict-safe-sync)
2. [Reader Mode: Saved Article Content, Offline Reading & Full-Text Search](#2-reader-mode-saved-article-content-offline-reading--full-text-search)
3. [Global Quick-Capture Hotkey & Capture Overlay](#3-global-quick-capture-hotkey--capture-overlay)
4. [Smart Organization: Auto-Labeling, Duplicate/Cluster Detection & Resurfacing](#4-smart-organization-auto-labeling-duplicateclustered-detection--resurfacing)
5. [Import & Full Backup/Restore Interoperability](#5-import--full-backuprestore-interoperability)
6. [X (Twitter) Post Capture — Isolated Section, Screenshots & Related Links](#6-x-twitter-post-capture--isolated-section-screenshots--related-links)
7. [YouTube Section — Isolated Video Links](#7-youtube-section--isolated-video-links)

---

## 1. Offline-First Capture Outbox with Retry & Conflict-Safe Sync

**Priority:** High · **Effort:** M–L · **Dependencies:** Supabase data layer, `capture-service`, `clipboard-controller`, `realtime-service`

### Problem / rationale

Capture is the product's signature feature and the least robust part of the system. Today:

- `clipboard-controller.ts:49` wraps `captureUrl` in `void ... .catch(() => undefined)` — all capture
  failures are silently swallowed.
- `capture-pipeline.ts:36-38` records the SHA-256 hash of the clipboard text **before** validation
  and persistence. If the capture then fails for any transient reason (offline, expired session,
  RLS error, Supabase 5xx), re-copying the same URL is ignored **for the rest of the session**,
  with no user-visible error and no retry path.
- `realtime-service.ts:16-18` documents reconciliation as strict **last-write-wins**. An edit made
  while offline (or before a refetch) can be discarded with no merge.

Net effect: the app silently drops the exact action it exists to perform, and a flaky connection
is indistinguishable from "nothing happened."

### Goal

Guarantee every captured link is eventually persisted or explicitly surfaced to the user, and
replace truncating last-write-wins with a non-destructive merge — while keeping Supabase as the
single source of truth.

### Proposed behavior

1. **Durable outbox.** Every valid URL that passes validation is appended to a local, persisted
   outbox (electron-store or a small SQLite/JSON file) *before* metadata fetch / DB insert.
2. **Retry with backoff.** The outbox drains on a schedule and on `online` / auth-recovered /
   realtime-reconnect events, using exponential backoff with jitter. Items survive restarts.
3. **Visible state.** Each outboxed link renders immediately in the library as a "pending" card
   (spinner/secondary style). It transitions to normal on success, or shows an error affordance
   with Retry / Discard on terminal failure.
4. **Retryable dedup.** Session dedup must key on successful persistence, not merely on receipt;
   a failed URL can be re-copied and re-attempted.
5. **Field-level merge.** On realtime updates, merge by `updated_at` per field (or at minimum
   per row) instead of blind overwrite, so a local read/archive toggle is not lost to a stale
   remote snapshot.
6. **Consent for destructive conflict.** If a true conflict cannot be auto-merged, keep both
   (local) and show a "conflict" badge rather than silently discarding.

### Technical approach

- Add `OutboxRepository` in `src/main/data/` with `enqueue`, `list`, `markSynced`, `markFailed`,
  `remove`. Persist with a schema version.
- Refactor `capture-service.ts` so capture is split into `prepare` (validate + canonicalize +
  enqueue) and `drain` (fetch metadata + ensure label + insert + broadcast). The renderer reads
  pending items via a new `links:pending` channel and a `links:changed` push already exists.
- Extend `IpcResult`-based channels: `links:pending-list`, `links:retry-pending`,
  `links:discard-pending`.
- Add an `online`/reconnect signal to the drain loop; `realtime-service` should expose a status
  callback (currently `.subscribe()` has none — `realtime-service.ts:23-35`).
- Merge logic lives in a pure module (`link-merge.ts`) so it is unit-testable.

### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | With the network disabled, copying a URL still creates a local pending card within ~1s. |
| AC2 | When connectivity returns, pending cards sync automatically and become normal cards without user action. |
| AC3 | Restarting the app with pending items preserves and resumes the outbox. |
| AC4 | A permanently failing item is surfaced with visible Retry and Discard actions; it never disappears silently. |
| AC5 | Re-copying a URL whose capture previously failed retries it (no permanent session hash lockout). |
| AC6 | A local read/archive toggle is not lost when a stale remote update arrives. |

### Risks / open questions

- Storage backend choice (electron-store vs. SQLite) and migration from existing store keys.
- Backoff policy could hammer Supabase on sustained errors; cap and surface a global banner.
- Merge semantics for `label` conflicts need a product decision (default: keep local, flag).

---

## 2. Reader Mode: Saved Article Content, Offline Reading & Full-Text Search

**Priority:** High · **Effort:** L · **Dependencies:** `metadata-service`, new content extractor, Supabase schema migration, renderer reader view

### Problem / rationale

Linkster stores only metadata (`metadata-parser.ts` extracts title/description/image/site/type).
It is therefore a **bookmark manager**, not a true read-later: links cannot be read offline, and
search covers only title/description/URL (server-side `or(ilike...)` in `link-repository.ts:17-19`).
The strongest differentiator versus browser bookmarks is absent.

### Goal

Turn saved links into durable, readable, searchable content: extract the readable article body on
capture, store it, present a clean reader view, and make the full text searchable — online and off.

### Proposed behavior

1. **Content extraction.** During metadata enrichment, also run a readability-style extractor over
   the fetched HTML to produce sanitized, self-contained article HTML (and a plain-text version)
   plus reading-time (word count) and extraction status.
2. **Reader view.** A new route/overlay (`ui-store.view === 'reader'` or a detail modal) renders
   the stored article with the app's typography, adjustable font size/width, and "Open original."
3. **Offline reading.** Once extracted, content is stored locally (and/or cached) so the reader
   works without network.
4. **Full-text search.** Add a generated `content_tsv tsvector` column with a GIN index; search
   query matches title, description, URL **and** content. Add a "searched content" facet.
5. **Graceful degradation.** Non-article pages (video, product, PDF) fall back to metadata-only
   with a clear "no reader content" state; extraction failures are recorded, not fatal.

### Technical approach

- New `content-extractor.ts` (pure, unit-tested) using the already-present `node-html-parser`, plus
  a DOM-sanitization allowlist to strip scripts, styles, trackers, and event handlers.
- Extend `metadata-service.ts` fetch result to carry `contentHtml`, `contentText`, `wordCount`,
  `extractionStatus`, `extractedAt`.
- DB migration `0003_reader_content.sql`: add `content_text text`, `content_html text` (or an
  object-storage reference), `word_count int`, `content_tsv tsvector generated always as (...) stored`,
  GIN index `idx_links_content_tsv`. Keep payload sizes bounded and consider Supabase Storage for
  large bodies.
- IPC: extend `Link` contract with reader fields (versioned), add `links:get-content`.
- Renderer: `ReaderView.tsx` + reuse `ui.tsx` primitives; sanitize on render too (defense in depth).
- Local cache: reuse the existing app-data dir; content keyed by link id + `updated_at`.

### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | Capturing a typical news/article URL yields stored readable content and a working reader view. |
| AC2 | The reader view renders offline after the content has been extracted once. |
| AC3 | Searching a phrase that appears only in the article body returns the link. |
| AC4 | Extracted HTML contains no `<script>`, inline event handlers, or remote tracking pixels. |
| AC5 | Non-extractable URLs show a clear metadata-only state and do not break capture. |
| AC6 | Reading time is displayed and is within ±20% of a manual count on a sample set. |

### Risks / open questions

- Licensing/copyright: store for personal offline reading only; consider retention policy.
- Storage cost and payload limits (Supabase row size); may require object storage for long articles.
- Extraction quality varies; needs a benchmark corpus and a fallback chain.
- Redirect-based SSRF (backend finding) must be fixed before fetching arbitrary page bodies.

---

## 3. Global Quick-Capture Hotkey & Capture Overlay

**Priority:** Medium · **Effort:** S–M · **Dependencies:** Electron `globalShortcut`, capture pipeline, renderer overlay

### Problem / rationale

Capture today requires copying a URL in another app and waiting for the watcher (native event or
up to ~1.3s on Linux polling). There is no way to deliberately capture a URL, add context, or
choose a label without first switching to Linkster. Deliberate, low-friction capture is a common
read-later expectation.

### Goal

Provide a system-wide shortcut that opens a tiny capture overlay to quickly save the current
clipboard URL or a typed URL with an optional note and label — without leaving the current app.

### Proposed behavior

1. **Global shortcut** (configurable, default `CommandOrControl+Shift+L`) opens a compact,
   always-on-top capture overlay near the cursor (or centered).
2. The overlay pre-fills from the clipboard if it holds a valid URL; otherwise focuses a URL input.
3. Optional **note** field (new `note` attribute on links) and a **label** picker (reusing
   `LabelPicker`), then Save (Enter) / Cancel (Esc).
4. Saving routes through the same capture pipeline (validation, dedupe, metadata, outbox) so there
   is one code path.
5. Shortcut registration failures (already-taken) surface a clear settings warning instead of
   failing silently.

### Technical approach

- Register/unregister in main (`globalShortcut.register`) tied to a new setting; expose
  `settings:get-hotkeys` / `settings:set-hotkey` IPC; store in electron-store via `settings-service`.
- Overlay = a small frameless `BrowserWindow` (`capture-overlay`) loading a dedicated renderer
  entry, or a route in the existing window with a global show/hide. Prefer a separate lightweight
  window to avoid stealing focus from the user's app.
- Reuse `captureUrl`/outbox from Feature 1; add `links:quick-create` for typed/annotated input.
- Add optional `note` column via a small migration (or store in a JSON attributes column).

### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | Pressing the shortcut from any app opens the overlay in <300ms. |
| AC2 | A clipboard URL is pre-filled and Enter saves it end-to-end. |
| AC3 | A typed URL can be saved with a note and label without touching the main window. |
| AC4 | Duplicate URLs are detected and reported in the overlay. |
| AC5 | If the shortcut is unavailable, Settings shows an actionable warning. |
| AC6 | Quick-captured links obey the same validation/dedup rules as clipboard capture. |

### Risks / open questions

- Global shortcuts can conflict with OS/app bindings; must be user-configurable.
- Overlay focus/blur behavior differs per OS (especially macOS activation policy).

---

## 4. Smart Organization: Auto-Labeling, Duplicate/Cluster Detection & Resurfacing

**Priority:** Medium · **Effort:** M · **Dependencies:** capture/CRUD path, new heuristics module, optional LLM provider

### Problem / rationale

Organization is purely manual and flat: a free-text `label` string with no server-side uniqueness
guarantee and no relationship to the `labels` list. Users must categorize every capture by hand,
the library accumulates near-duplicates (different tracking params, mirrors, same article via
different URLs), and there is no mechanism to bring unread links back — which defeats the purpose
of a read-later queue.

### Goal

Reduce manual effort and close the read-later loop: suggest labels automatically, detect duplicate
and clustered content, and resurface stale unread items.

### Proposed behavior

1. **Auto-label suggestion.** On capture, suggest a label using heuristics (existing label → domain
   map, OG `og:type`, path keywords, title tokens) with a confidence score. Auto-apply when
   confidence is high and the user has opted in; otherwise show a one-click chip on the card.
2. **Duplicate & cluster detection.** Beyond exact normalized-URL dedupe, detect near-duplicates
   (same canonical domain + similar title, or same `og:image`) and group them. Offer "keep one,
   archive rest" or "merge labels."
3. **Resurfacing.** A scheduled digest (in-app tray/notification, optional daily) surfaces N older
   unread links; a "Reading queue" view orders by age/priority. Add simple snooze/priority.
4. **Explainability & control.** Every automated suggestion is reversible and shows *why*
   (matched domain/label); a global toggle disables automation entirely.

### Technical approach

- Pure, testable `auto-label.ts` (rules + optional embedding/LLM call behind an interface) and
  `duplicate-detector.ts` (normalized domain + title similarity via token Jaccard / trigram).
- Persist suggestions as non-destructive metadata (`suggested_label`, `suggestion_reason`,
  `cluster_id`) rather than rewriting user data.
- Reading queue is a server query (`priority`, `snoozed_until`, order by `created_at`) — requires
  additive columns and indexes.
- Resurfacing scheduler in main process (respects notification prefs, quiet hours).
- All LLM calls are opt-in, key-configurable, and never send credentials; degrade to heuristics.

### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | Capturing from a previously labeled domain suggests the matching label with a visible reason. |
| AC2 | Two URLs of the same article (differing tracking params/shortener) are grouped as duplicates. |
| AC3 | The user can accept/reject a suggestion in one click; rejected suggestions are not repeated. |
| AC4 | A "Reading queue" surfaces untouched unread items and supports snooze/priority. |
| AC5 | Automation can be fully disabled in Settings. |
| AC6 | With LLM disabled, all features still function via heuristics. |

### Risks / open questions

- False positives erode trust; default to suggestions over silent auto-application.
- Privacy: any remote (LLM) enrichment must be opt-in and disclosed.
- Cluster identity can drift as titles update; keep it recomputable.

---

## 5. Import & Full Backup/Restore Interoperability

**Priority:** Medium · **Effort:** M · **Dependencies:** `data-export-service`, `export-format`, CRUD repository, optional scheduler

### Problem / rationale

Data portability is one-way. `data-export-service.ts` and `export-format.ts` produce timestamped
JSON/CSV into `Documents/Linkster`, but there is **no import** and no backup/restore. This makes
Linkster a hard destination to adopt (users cannot migrate existing bookmarks) and leaves users
without a safe recovery path — especially risky given realtime last-write-wins and silent capture
failures.

### Goal

Make Linkster a viable destination and a safe home: import from common sources and provide
first-class, verifiable backup/restore.

### Proposed behavior

1. **Browser bookmark import.** Parse Chrome/Edge/Firefox bookmark HTML export (folder structure →
   labels) and import with dedupe and progress reporting.
2. **Service import.** Import Pocket/Instapaper/Raindrop CSV/JSON exports, mapping fields
   (title/url/tags/created/read/archive) onto Linkster's model.
3. **Full backup/restore.** A single archive (links + labels + colors + reader content + settings)
   with a schema version; restore validates and merges (never silently overwrites).
4. **Scheduled auto-backup.** Optional periodic backup to a chosen folder, with retention count.
5. **Idempotent, resumable, observable.** Large imports show progress, can be cancelled, and are
   safe to re-run (dedupe by normalized URL).

### Technical approach

- Pure parsers: `bookmarks-html-parser.ts`, `import-mapper.ts` (unit-testable), producing a common
  intermediate `ImportRecord` shape.
- Reuse `normalizeUrl` and the outbox/bulk-insert path (Feature 1) for resilient, batched writes.
- Backup format = versioned JSON (or zip) with a manifest; reuse `export-format.ts` conventions.
- IPC: `data:import-pick`, `data:import-run` (streams progress via push), `data:backup-create`,
  `data:backup-restore`.
- Auto-backup via the existing main-process scheduler pattern (like screenshot watcher); store
  location/retention in settings.

### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | Importing a Chrome/Edge/Firefox bookmarks HTML file creates links with folder-derived labels. |
| AC2 | Re-running the same import does not create duplicates (dedupe by normalized URL). |
| AC3 | Pocket/Instapaper/Raindrop exports map title/url/tags/read/archive correctly. |
| AC4 | A full backup can be restored on a fresh install, recovering links, labels, colors, and content. |
| AC5 | Import/restore show progress and can be cancelled without corrupting existing data. |
| AC6 | Restore merges by default and reports counts of added/skipped/conflicted items. |

### Risks / open questions

- Different export schemas across services/versions; keep mappers tolerant and versioned.
- Backup archives contain personal data; document location and encourage encryption/at-rest care.
- Restore conflict policy (merge vs. replace) must be an explicit user choice.

---

## Suggested sequencing

| Order | Feature | Why first |
|---|---|---|
| 1 | Offline-First Capture Outbox | Fixes the core promise; unblocks Features 3–5 (shared write path). |
| 2 | Global Quick-Capture Hotkey | Small, high-visibility; reuses outbox and proves the shared path. |
| 3 | Import & Backup/Restore | Lowers adoption risk and makes later schema changes safe. |
| 4 | Reader Mode | Largest differentiator; depends on a stable write path + SSRF fix. |
| 5 | Smart Organization | Builds on reader content and import volume to be useful. |

> **Cross-cutting prerequisite:** Fix the SSRF/redirect and private-IP validation gaps
> (`metadata-service.ts:67`, `url-validator.ts:29`) before fetching or storing arbitrary page
> content or importing third-party URLs.

---

## 6. X (Twitter) Post Capture — Isolated Section, Screenshots & Related Links

> **Status:** Implemented (2026-09-17) · **Priority:** High · **Effort:** M
> **Spec:** `.agents/specs/x-post-capture.md`

Captured `x.com` / `twitter.com` status links are canonicalized (mirrors dedupe to one tweet),
isolated in a dedicated **X Posts** section (excluded from the library grid, search, and stats),
and screenshotted locally into `userData/x-captures/<linkId>.png` using X's official embed with a
self-rendered fallback card. The first external link found in the tweet is saved to the library
through the normal outbox path under an automatic **`X` label** and shown as a related link on the
post card. Capture jobs are a
durable local queue with backoff, restart survival, and visible Retry; metadata (author, text,
posted-at) syncs via the `link_x_posts` side table (migration `0008`).

---

## 7. YouTube Section — Isolated Video Links

> **Status:** Implemented (2026-09-17) · **Priority:** High · **Effort:** S
> **Spec:** `.agents/specs/youtube-section.md`

YouTube video links are canonicalized (`watch?v=`, `youtu.be`, shorts, embed, live → one watch URL),
isolated in a dedicated **YouTube** section (excluded from the library grid, search, and stats), and
rendered from the metadata + thumbnail the normal capture pipeline already fetches. The section
offers Open on YouTube, Copy, Refresh metadata, Archive/Unarchive, and Delete; videos open in the
system browser (there is no in-app player and the capture pipeline stores no local files). Queued
captures show as pending cards in the section. No local files or side tables are involved — `links.kind`
(migration `0009`) is the whole isolation mechanism. Channels and playlists stay regular library
links.
