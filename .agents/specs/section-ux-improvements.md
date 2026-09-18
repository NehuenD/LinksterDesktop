# Spec: X Posts & YouTube Sections — UX Improvement Program

> **Status:** Proposed (2026-09-17)
> **Derived from:** three-agent audit (X section, YouTube section, shared integration); key claims re-verified against source.
> **Supersedes where noted:** `youtube-section.md` decision 6 (delete without undo) and the X spec's unanswered post-lifecycle gap.
> **Scope:** Improvements to the existing isolated sections (X posts, YouTube) — not net-new domains.
> Each work package is self-contained (evidence, intended behavior, technical notes, acceptance criteria,
> effort, risks) and can be lifted into its own implementation task.

---

## Table of contents

1. [Goal & Rationale](#1-goal--rationale)
2. [Decisions locked (2026-09-17)](#2-decisions-locked-2026-09-17)
3. [Work Packages](#3-work-packages)
   - [WP1 — X capture state truth](#wp1--x-capture-state-truth)
   - [WP2 — X post lifecycle (delete + undo, archive, read)](#wp2--x-post-lifecycle-delete--undo-archive-read)
   - [WP3 — X card content & screenshot viewer](#wp3--x-card-content--screenshot-viewer)
   - [WP4 — YouTube lifecycle & read semantics](#wp4--youtube-lifecycle--read-semantics)
   - [WP5 — YouTube metadata enrichment & card upgrade](#wp5--youtube-metadata-enrichment--card-upgrade)
   - [WP6 — In-section search, filter & sort](#wp6--in-section-search-filter--sort)
   - [WP7 — Bulk selection & actions](#wp7--bulk-selection--actions)
   - [WP8 — Per-kind counts & sidebar badges](#wp8--per-kind-counts--sidebar-badges)
   - [WP9 — Section polish, accessibility & keyboard](#wp9--section-polish-accessibility--keyboard)
   - [WP10 — Notifications & feedback consistency](#wp10--notifications--feedback-consistency)
4. [Sequencing](#4-sequencing)
5. [Test surface](#5-test-surface)
6. [Documentation updates](#6-documentation-updates)
7. [Deferred / future work](#7-deferred--future-work)
8. [Open questions](#8-open-questions)

---

## 1. Goal & Rationale

The X and YouTube sections isolate their content correctly at the data layer (`links.kind`, per-kind
RPCs and stats), but the renderer stops short:

- **State is dishonest.** Failed queued X captures render as "Capturing…" forever with no retry
  (only Discard); retry can toast "Capture succeeded" when nothing was captured; YouTube refresh
  reports success on an empty fetch; first-load errors show the "no videos" empty state simultaneously.
- **Lifecycle is missing or inconsistent.** X posts cannot be deleted at all (only the local PNG);
  YouTube deletes are irreversible (library deletes have undo); watched/read state has no manual
  control in either section and is invisible on X.
- **Content is effectively unfindable.** Neither section has search, filters, or sort, and both are
  excluded from global search/palette, so older saved items are reachable only by scrolling.
- **Cards under-deliver.** YouTube stores a description but never shows it; no duration, label, or
  channel identity. X never shows the tweet's posted date, can't copy the post link, opens related
  links in the browser instead of the saved copy, and its screenshot viewer is an accessible-dialog
  anti-pattern that shrinks tall captures to unreadability.

This program fixes trust (WP1, WP4, WP10), then lifecycle parity (WP2, WP4, WP7), then findability
(WP6), then content quality (WP3, WP5, WP9), backed by data (WP8).

## 2. Decisions locked (2026-09-17)

1. **X posts get full lifecycle parity:** post-level delete with undo (via the existing
   `links:restore` path), archive/unarchive, and manual read/unread — matching the library and
   YouTube capabilities. The current "delete PNG only" dead end is removed.
2. **Search scope: in-section first, global later.** WP6 delivers per-section search/filter/sort.
   Letting global search / command palette reach isolated kinds (the `search_links(p_kind => 'all')`
   path) is explicitly **deferred** future work, not part of this program.
3. **Schema additions are allowed** for YouTube enrichment: duration, channel identity, and
   origin context (Shorts / Music / Live / playlist) may add columns or a `link_youtube` side table.
   `youtube-section.md` decision 2 ("no side table") is relaxed for these fields.
4. **Playback stays external.** No in-app player. A non-playing detail overlay (large poster, full
   description, actions) is compatible with this decision and may host enriched content.
5. **Isolation guarantees hold until changed deliberately.** WP6/WP8 keep `kind` defaulting to
   `'link'` for library queries, search, and mark-all-read; section queries opt in to their kind.

## 3. Work Packages

### WP1 — X capture state truth

**Priority:** High · **Effort:** S–M · **Area:** `x-post-mapper`, `handlers/x`, `x-store`, `XScreen`, `XPostCard`

#### Evidence

- `src/main/services/x-post-mapper.ts:45-67` — queued outbox items are mapped with
  `captureStatus: 'pending'` hardcoded (`:60`) even when the outbox item is terminally failed;
  `lastError` is mapped into `captureError` (`:61`) but is never rendered anywhere.
- `src/renderer/src/components/XPostCard.tsx:32,54-60,88-91` — `isBusy` derives only from
  `captureStatus`; failed queued items show "Capturing…"/"Queued locally" and the only action is
  Discard (`:131-139`). No Retry, no error text.
- `src/renderer/src/screens/XScreen.tsx:23-34` — subscribes to `x:changed` and `links:changed`
  only; the outbox broadcast is `links:onPendingChanged` (`src/main/services/capture-service.ts:151,247`),
  which the library consumes globally (`App.tsx:42-45`) and the YouTube screen gets for free. A copy
  while offline sitting on the X screen shows nothing until remount/Refresh.
- `src/main/ipc/handlers/x.ts:84-93` — retry returns `ok` when `retried > 0` even if nothing was
  captured; `src/renderer/src/store/x-store.ts:91-96` then toasts "Capture succeeded".
- `src/main/ipc/handlers/x.ts:65-68` — X header total = persisted + pending; sidebar X badge uses
  persisted stats only (`src/renderer/src/components/Sidebar.tsx:130-135`). Three count sources
  disagree across the app.
- Reference pattern: `src/renderer/src/components/PendingLinkCard.tsx:45-78` (Failed + last error +
  Retry/Discard) and `src/renderer/src/store/youtube-store.ts:56-76` (generation guard).

#### Proposed behavior

1. Queued X items render from the outbox item's real state: queued vs failed, with `lastError`
   shown on failure and **Retry** offered (routing through `retryPending`) in addition to Discard.
2. `XScreen` reacts to `links:onPendingChanged` so queued/discarded X items appear and disappear live.
3. Persisted-but-capture-running posts distinguish "capture in progress locally" from "no capture
   on this device" (without a DB migration if possible; at minimum, don't claim "Capturing…" for
   an outbox item that has failed).
4. Retry only reports success when a capture actually completed; while a retry/render is in flight
   the button is disabled/busy.
5. All section totals use one consistent definition per surface: sidebar badge = persisted count;
   section header = persisted + pending, labeled as such (or switch both to persisted with a
   pending hint). Count behavior is documented in the header copy/tooltip.

#### Technical approach

- Extend `toPendingXPost` to carry outbox `status` into `XPost.captureStatus` (`failed` when the
  outbox item is failed) and keep `lastError` in `captureError`; render `captureError` on the card.
- Add generation-guarded `load` to `x-store` (mirror `youtube-store.ts:12,38-43`) and subscribe
  `XScreen` to `api.links.onPendingChanged`; dedupe the double `x:changed`+`links:changed` reload.
- Change `x:retry-capture` to return a processed/failed summary (or an explicit `completed: boolean`)
  and make `x-store.retryCapture` toast on `completed` only; add an in-flight flag to disable buttons.
- Optional: include local job presence in `x:list` (from `x-capture-repository.list()`) so the card
  can show a true "capturing now" state. Avoid a schema change if the queue can be exposed cheaply.

#### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | A failed queued X capture shows a failed state with its error and a working Retry + Discard. |
| AC2 | Copying an X URL while the X screen is open (online or offline) shows the pending card without a manual refresh. |
| AC3 | Retry never toasts "Capture succeeded" unless a capture completed; the button is disabled while in flight. |
| AC4 | Sidebar badge, section header, and list are consistent with a documented definition; pending is either included everywhere it is shown or labeled. |

#### Risks

- Exposing the local capture queue through `x:list` couples the renderer to main-process internals;
  keep it behind the existing contract and test the mapper.

---

### WP2 — X post lifecycle (delete + undo, archive, read)

**Priority:** High · **Effort:** M · **Area:** IPC `x:*` / `links:*`, `x-store`, `XPostCard`, `XScreen`, `links-store` restore path

#### Evidence

- `src/renderer/src/components/XPostCard.tsx:109-115,160-171` — Delete removes only the local PNG
  ("The post stays in the section and can be captured again"); `src/main/ipc/handlers/x.ts:135-151`
  confirms PNG-only. `api.x` exposes no post delete (`src/preload/index.ts:178-192`).
- X posts are invisible to library selection/bulk delete (`src/main/data/link-repository.ts:87-88`
  defaults `kind='link'`), so no UI path removes a saved X post. Spec anticipated cascading delete
  (`x-post-capture.md:243`) but no handler/UI shipped.
- `links:delete` already cleans capture files/jobs for X posts (`src/main/ipc/handlers/links.ts:127-137`).
- The library's lossless undo/restore exists: `RestoreLinkInput` (`src/shared/contract/ipc.ts:285-302`),
  `links-store.ts:441-474`, `UndoToast.tsx` (timer via store). YouTube delete is hard-delete with no
  undo (`src/renderer/src/store/youtube-store.ts:119-128`; spec decision `youtube-section.md:92`).
- Read state: `open` writes `is_read` optimistically (`src/renderer/src/store/x-store.ts:71-89`), but
  no X card renders or toggles it; `XPost.isRead` already exists (`ipc.ts:566-598`).

#### Proposed behavior

1. **Delete post** on the X card (confirm dialog) deletes the link row + capture file/job, with a
   library-style undo bar (same 7s window and countdown pattern). Undo restores the link row.
2. **Archive/Unarchive** on the card; archived posts stay in the X grid with the archive badge
   (YouTube parity), and WP6 adds the filter to hide them.
3. **Read/Unread** action on the card; unread state visibly rendered (dot/badge), consistent with
   `LinkCard` (`src/renderer/src/components/LinkCard.tsx:75-80,157-160`).
4. Empty state offers an actionable CTA (Add Link / enable capture) since `EmptyState` supports
   `action` (`src/renderer/src/components/EmptyState.tsx:36`).

#### Technical approach

- Add `x:delete-post`? Not needed: reuse `api.links.delete(linkId)` (kind-agnostic) + `links:restore`
  for undo. Render `UndoToast` in the X screen shell (it is currently library-only,
  `HomeScreen.tsx:299`) or route through a shared undo slice.
- Archive/read use `api.links.update(linkId, { isArchived } / { isRead })`; update `x-store` items
  optimistically with reload-on-failure (pattern from `youtube-store.ts:95-103`).
- Undo restores the link but **not** X metadata (`x-post-repository.ts:162-185` resets capture state
  on restore). Decision: accept re-capture; the confirm copy must say the screenshot is not restored.
- After mutations reload `x-store` and `links-store` (sidebar counts).

#### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | X card offers Delete (post), and undo within the window restores the post with its id/createdAt/read/archive state. |
| AC2 | Archived X posts show the archive badge and can be unarchived; no post is lost by archiving. |
| AC3 | Read/Unread can be toggled manually and is visible on the card; opening a post still auto-marks read per the setting. |
| AC4 | The delete confirm states that the local screenshot is removed and is not restored by undo. |

#### Risks

- Restore does not recreate the screenshot (local-only artifact by design) — copy must set expectations.
- Undo UI currently lives in the library branch; extracting it is the main cost.

---

### WP3 — X card content & screenshot viewer

**Priority:** Medium-High · **Effort:** S–M · **Area:** `XPostCard`, `x-store`, `handlers/x`, `x-capture-service`

#### Evidence

- Preview is a raw overlay (`src/renderer/src/components/XPostCard.tsx:144-158`): no Escape, no close
  button, no focus trap; captures can be 550×5000 px (`src/main/services/x-capture-render.ts:8-14`)
  and are scaled to fit — unreadable on a laptop. `x:open-capture` exists end-to-end
  (`ipc.ts:127`, `handlers/x.ts:111-121`) but is called nowhere in the renderer.
- `postedAt` is mapped (`x-post-mapper.ts:31`) but never rendered; the card shows only `savedAt`
  (`XPostCard.tsx:65-71`).
- Related-link chip always opens the browser (`XPostCard.tsx:77-86`); `relatedLinkId` is never used
  in the renderer even though the RPC returns it (`0008_x_posts.sql:244,249`).
- Spec promised "Copy post link" (`x-post-capture.md:185`); not implemented (`XPostCard.tsx:88-140`).
- Capture completion is silent: state is set `ok` (`src/main/services/x-capture-service.ts:153-157`)
  with no notification or toast; the only notification is at link persistence and shows the raw URL
  because X titles are null (`src/main/services/capture-service.ts:88-92,234`).
- With a local PNG the only actions are Preview/Reveal/Delete — no re-capture/refresh
  (`XPostCard.tsx:97-117`), though `x:retry-capture` can already re-enqueue (`handlers/x.ts:84-86`).

#### Proposed behavior

1. **Accessible viewer:** reuse `Modal`/`useModalBehavior` (`src/renderer/src/components/ui.tsx:13-56`,
   `use-modal.ts`) with Escape/close/focus trap, scroll containment and an "Open image" action wired
   to `x:open-capture`; fit-to-width by default, scroll for tall captures.
2. Show **posted date** ("posted … · saved …") when `postedAt` exists; fall back gracefully when null.
3. Related chip opens the **saved library copy** when `relatedLinkId` exists (reader/library card +
   a "Saved" hint); otherwise falls back to the external URL.
4. Add **Copy post link** (canonical URL) — spec parity.
5. Add **Re-capture** for posts that already have a PNG (confirm overwrite), reusing the existing
   enqueue+retry path.
6. Notify or toast (respecting the notification setting) when a capture completes, using the
   now-available author/text instead of the raw URL.

#### Technical approach

- Viewer: dedicated component rendered by `XPostCard` (or `XScreen`) using the shared modal.
- Related link: `openReader(relatedLinkId)` / `links-store.openLink` (`links-store.ts:306-331`).
- Completion feedback: add an optional success hook to `createXCaptureService` (it already has
  `notifyChanged`, `x-capture-service.ts:39,190`) or emit a new push event consumed by `x-store`.
- Re-capture with confirm; overwrite write path already atomic (`x-capture-files.ts:80-86`).

#### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | The capture viewer closes on Escape and click-outside, traps focus, scrolls tall captures, and can open the image in the OS viewer. |
| AC2 | Cards show the tweet's posted date when known and the related chip opens the saved copy when the link exists. |
| AC3 | Copy post link copies the canonical URL; Re-capture overwrites with confirmation. |
| AC4 | Capture completion produces a user-visible signal consistent with the app's notification setting. |

#### Risks

- Viewer reuse must not regress library modals; verify focus handling on all platforms.
- Completion notifications could be noisy — reuse the existing preference, do not add a new one by default.

---

### WP4 — YouTube lifecycle & read semantics

**Priority:** High · **Effort:** S–M · **Area:** `YouTubeCard`, `youtube-store`, `XScreen` parity, IPC (no schema)

#### Evidence

- Only actions are Copy / Refresh / Archive / Delete (`src/renderer/src/components/YouTubeCard.tsx:91-99`);
  LinkCard has an explicit Read/Unread action (`LinkCard.tsx:157-160`).
- Click marks watched only if not archived and the global **library** setting
  `reading.markReadOnOpen` is on (`youtube-store.ts:88-104`; `SettingsScreen.tsx:253-259`); with the
  setting off there is no way to mark a video watched, and the dot can never be cleared.
- Delete hard-deletes with no undo (`youtube-store.ts:119-128`), unlike the library
  (`links-store.ts:357-370`). Spec decision `youtube-section.md:92` explicitly chose this; decision 1
  above supersedes it.
- Archived videos stay in the same newest-first grid with a badge; no archived filter
  (`YouTubeCard.tsx:73-77`; query hardcoded `youtube-store.ts:10`).
- `markAllRead` RPC already accepts `p_kind` (`src/main/data/link-repository.ts:550-562`;
  migration `0010_isolated_sections_repair.sql:114-149`) — no backend change needed.

#### Proposed behavior

1. Watched/Unwatched toggle on the card (optimistic, reload-on-failure) and a **Mark all watched**
   header action scoped to the current query.
2. Archived filter (reuse WP6's toolbar) so archived videos can be hidden; archived badge stays.
3. Delete gets the same undo window as the library/section X (WP2) via `links:restore`.
4. Watched copy/setting terminology clarified for videos (either reuse the reading preference with
   copy that mentions videos, or add a video-specific setting — see open questions).

#### Technical approach

- Toggle: `api.links.update(id, { isRead })` optimistic pattern (`youtube-store.ts:95-103`).
- Mark all watched: `api.links.markAllRead({ kind: 'youtube', ...currentQuery })`; reload section.
- Undo: `links:restore` + `UndoToast` in the section shell (shared with WP2).
- No migrations.

#### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | Any video can be marked watched/unwatched manually, independent of the open-on-click preference. |
| AC2 | Mark all watched affects only the current filtered result set; individual videos remain reversible via the watched toggle. |
| AC3 | Deleting a video offers undo within the standard window; restored rows preserve id/read/archive state. |
| AC4 | Archived videos can be filtered in/out and unarchived. |

#### Risks

- "Watched" via `isRead` shares stats with the library's unread semantics only if WP8 lands; keep
  the field as the single source of truth.

---

### WP5 — YouTube metadata enrichment & card upgrade

**Priority:** Medium-High · **Effort:** M–L · **Area:** `metadata-parser`, `youtube-url`, contract, migration, `YouTubeCard`, `youtube-store`, `handlers/links`, `AddLinkDialog` flow

#### Evidence

- Card shows title, channel (`author`), relative `createdAt`, thumbnail (`YouTubeCard.tsx:80-88`).
  Description is parsed and stored (`src/main/services/metadata-parser.ts:120-122`) and rendered in
  the library (`LinkCard.tsx:127-131`) but not here. Labels/notes are also not shown.
- No duration/publish date/channel URL in the model (`Link` at `src/shared/contract/ipc.ts:190-211`;
  parser fields `metadata-parser.ts:95-133`). No Data API/oEmbed call exists.
- Thumbnail is `og:image` with `hqdefault.jpg` (480×360) fallback, stretched into 260px+ 16:9 crops
  with no skeleton (`YouTubeCard.tsx:29-40,53-61`); og images can be signed/expire (comment at `:30-31`).
- Manual Add creates a link with **no metadata fetch** (`AddLinkDialog.tsx:16-25`;
  `handlers/links.ts:64-91`), producing a blank card whose only repair is the unhinted hover Refresh.
  Refresh itself reports success even when the fetch returned nothing (`handlers/links.ts:238-252`;
  `metadata-service.ts:134-135`; `youtube-store.ts:78-86`).
- Canonicalization erases origin: Music/Shorts/Live/playlist context collapses to the plain watch URL
  (`src/shared/lib/youtube-url.ts:54-56,64-67`), so the app cannot distinguish them later.

#### Proposed behavior

1. **Manual Add** for a YouTube URL fetches metadata immediately (or visibly offers "Fetch details").
2. **Duration** displayed as a YouTube-style pill; parse from the watch page
   (`lengthSeconds` / `itemprop="duration"` / `og:video:duration`).
3. **Channel identity** captured (channel URL/ID when present in the watch page) to enable
   "more from this channel" grouping later; channel display name remains the card subtitle.
4. **Origin context** preserved at parse time (Shorts/Music/Live, playlist id) and stored; canonical
   dedupe URL stays `watch?v=<id>`.
5. Card upgrade: description (2-line clamp), label/note chip, thumbnail quality ladder
   (`maxresdefault → hqdefault → mqdefault`) with a loading skeleton and a neutral placeholder.
6. Refresh failure is distinguishable from success (no "Metadata refreshed" toast when nothing
   was fetched).

#### Technical approach

- Migration: extend `links` with `duration_seconds int`, `channel_url text`, `origin text`,
  `playlist_id text` (or a `link_youtube` side table keyed by `link_id` — decision 3 allows either;
  prefer a side table if the field list grows, columns if it stays at four). Keep it out of the
  realtime publication unless needed.
- `metadata-parser.ts`: parse duration/`itemprop`/`lengthSeconds` and channel link/ID; extend
  `LinkMetadata` and the mapper.
- `youtube-url.ts`: extend `YouTubeVideoRef` with optional `origin`/`playlistId` without changing
  the canonical URL; update `parseYouTubeVideoUrl` tests.
- `handlers/links.ts` create path: for `kind === 'youtube'`, enqueue a metadata fetch (reuse
  `refreshMetadata` internals) or return a flag the dialog uses to show "Fetch details".
- `YouTubeCard`: add description (clamp), duration pill, label chip; image `onError` ladder.
- Update export/backup mapping for new fields (`link-mapper.ts` / backup format tests).

#### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | Adding a YouTube URL by hand results in a populated card (title, thumbnail, channel) without manual Refresh. |
| AC2 | Duration renders as a pill and is accurate; absent/unknown duration degrades cleanly. |
| AC3 | Description and label/note are visible on the card; long text clamps without breaking grid rhythm. |
| AC4 | A failed/empty refresh does not report success; origin (Short/Music/Live/playlist) survives capture and is visible or queryable. |
| AC5 | Export/restore round-trips the new fields. |

#### Risks

- Watch-page scraping is fragile; all new fields must be optional and never block capture.
- Origin context is a deliberate relaxation of `youtube-section.md` scope; keep it additive.

---

### WP6 — In-section search, filter & sort

**Priority:** High · **Effort:** M · **Area:** `YouTubeScreen`/`youtube-store`, `XScreen`/`x-store`, migration for `x_post_list`, shared toolbar component

#### Evidence

- YouTube query is hardcoded `{ kind: 'youtube', sort: 'newest' }` (`youtube-store.ts:10`); the X
  order is fixed inside `x_post_list` (`0008_x_posts.sql:251`). No search input in either screen
  (`YouTubeScreen.tsx`, `XScreen.tsx`).
- The library backend already supports `search`, `filter` (unread/archived), and `sort`
  (newest/oldest/title/domain) generically over `kind` (`src/shared/contract/ipc.ts:232-251`;
  `link-repository.ts:44-106`; RPC `0010_isolated_sections_repair.sql:155-249`) — YouTube needs **no
  backend work**.
- X search was explicitly out of scope v1 (`x-post-capture.md:33`); `search_links` searches
  title/description/url/content but not `link_x_posts.text` (`0008_x_posts.sql:112-156`), and
  `x_post_list` has no search/sort params (`0008:203-254`).
- Library reference UI: `FilterBar.tsx` (search debounce, clear-all) and `HomeScreen.tsx:144-218`.

#### Proposed behavior

1. **YouTube toolbar:** search (server, debounced), filter (Unwatched / Archived / All), sort
   (Newest / Oldest / Title). Query state lives in `youtube-store`; pagination and "has more"
   respect the active query.
2. **X toolbar:** search over tweet text/author/handle, filter (Unread / Archived / Has link /
   Capture failed), sort (Newest saved / Oldest saved / Author). Requires extending `x_post_list`
   (or serving X from `links.list` + join).
3. Filtered-empty state is distinct from first-run empty, with a "Clear filters" CTA
   (library parity, `HomeScreen.tsx:249-265`).
4. Global search/palette exclusion remains unchanged in this program (decision 2).

#### Technical approach

- YouTube: move `YOUTUBE_QUERY` into store state; pass `search`/`filter`/`sort` through
  `api.links.list`; reset pagination on query change (generation guard already exists).
- X: migration extending `linkster_x_post_list` with `p_search text`, `p_filter text`,
  `p_sort text` (or switch the X list to `search_links(p_kind := 'x-post')` + join for text/author
  search). Add migration tests in the existing style.
- Shared `SectionToolbar` component (search input + filter chips + sort select) to keep both
  sections visually consistent with `FilterBar`.

#### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | YouTube search finds videos beyond the loaded page and respects active filters/sort while paginating. |
| AC2 | X search matches tweet text, author name, and handle; filters and sort work with pagination. |
| AC3 | Clearing filters restores the unfiltered list; filtered-empty shows a clear CTA, not the first-run empty state. |
| AC4 | Library search/stats remain kind-isolated (`kind='link'` defaults untouched). |

#### Risks

- X RPC changes need careful SQL + migration tests; keep the function signature backward compatible
  (defaults preserve current behavior).

---

### WP7 — Bulk selection & actions

**Priority:** Medium · **Effort:** M · **Area:** `YouTubeScreen`, `XScreen`, `YouTubeCard`, `XPostCard`, `selection.ts`, `BulkActionBar`

#### Evidence

- Sections render bare grids with no checkboxes/selection (`YouTubeScreen.tsx:94-101`; X grid).
  Selection state and `BulkActionBar` are library-store-bound (`links-store.ts:480-517`;
  `BulkActionBar.tsx:6-16`).
- Bulk IPC is kind-agnostic and already exists (`handlers/links.ts:139-165`), and the selection
  helpers are pure (`src/shared/lib/selection.ts`), including shift-click range select.
- Housekeeping 30 saved videos requires 30 confirm dialogs today.

#### Proposed behavior

1. A selection mode in both sections (checkbox on card; shift-click ranges; select-all-loaded,
   with "select all matching" once WP6 query state exists).
2. `BulkActionBar` actions: YouTube — Mark watched, Archive/Unarchive, Delete (with undo).
   X — Mark read, Archive/Unarchive, Delete post (with undo).
3. Selection clears on query change/view exit; Escape cancels selection.

#### Technical approach

- Extract a shared selection slice (or duplicate the minimal store logic per section) and generalize
  `BulkActionBar` to take action descriptors instead of being library-store-bound.
- Reuse `links:bulk-update` / `links:bulk-delete`; wire undo snapshots per WP2/WP4.

#### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | Shift-click range selection and select-all work in both sections. |
| AC2 | Bulk archive/read/delete act on the selection and refresh counts; delete remains undoable. |
| AC3 | Selection is keyboard-reachable and cannot leak across sections or queries. |

#### Risks

- Generalizing `BulkActionBar` touches library code — regression-test the library flows.

---

### WP8 — Per-kind counts & sidebar badges

**Priority:** Medium · **Effort:** S–M · **Area:** migration (`link_stats`), `LinkStats` contract, `Sidebar`, both stores

#### Evidence

- `link_stats` returns raw totals for isolated kinds: `x_posts` and `youtube` counts
  (`0009_youtube_section.sql:49-64`); no unread/unwatched split. Sidebar badges are all-time totals
  (`Sidebar.tsx:124-135`), so a section can never indicate a queue.
- `isRead`/`isArchived` already exist on these rows and mark-all-read accepts `p_kind`
  (`link-repository.ts:550-562`; `0010:114-149`).
- Pending sidebar badge counts only `kind === 'link'` (`Sidebar.tsx:60-64`), leaving section
  pending invisible outside its screen (partially addressed by WP1 for X, WP10 for notifications).

#### Proposed behavior

1. `link_stats` gains per-kind unread (and optionally archived) counts:
   `x_posts_unread`, `youtube_unwatched` (names TBD).
2. Sidebar badges for X/YouTube show unread/unwatched when non-zero (optionally with total in the
   tooltip) — a real queue indicator.
3. Header counts in each section use the same stat source as the sidebar.

#### Technical approach

- Migration extending `link_stats` with `FILTER (WHERE kind = 'youtube' AND NOT is_read)` style
  aggregates; update `LinkStats` contract (`ipc.ts:316-325`) and `link-repository.ts` mapping
  (`:114-135`); extend migration + stats tests.

#### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | Sidebar shows unwatched/unread counts per section and updates after open/mark-all/toggle without app restart. |
| AC2 | Counts are computed server-side (no full-table fetch) and remain correct for large libraries. |
| AC3 | Library stats (total/unread/archived/byLabel) still exclude isolated kinds. |

#### Risks

- Stats contract changes ripple through stores' reload paths; keep additions optional/back-compatible.

---

### WP9 — Section polish, accessibility & keyboard

**Priority:** Medium · **Effort:** S · **Area:** `YouTubeScreen`, `YouTubeCard`, `XScreen`, `XPostCard`, `use-global-shortcuts`, styles

#### Evidence

- YouTube first-load error renders the error banner **and** the "No YouTube videos yet" empty state
  (`YouTubeScreen.tsx:69-91`); `loadMore` failures toast but don't surface inline
  (`youtube-store.ts:68-75`).
- Partial-load failure also shows the empty state when `items.length === 0` but `status !== 'loading'`.
- Unwatched dot is a `title`-only empty span, not announced to screen readers, and sits under the
  hover action bar (`YouTubeCard.tsx:67-72` vs `:91`).
- No `aria-live` for "Loading more…"; header Refresh never disables while loading
  (`YouTubeScreen.tsx:49-55,102-106`).
- Thumbnail pop-in with no skeleton; `hqdefault` stretched (`YouTubeCard.tsx:29-40,53-61`).
- Global shortcuts (`/`, Cmd/Ctrl+K, Cmd/Ctrl+N) are gated to the library
  (`use-global-shortcuts.ts:26-29`; `HomeScreen.tsx:78-82`); the palette is mounted only there
  (`HomeScreen.tsx:293-298`). Sections have no keyboard entry.
- Doc drift: `Features.md:382-383` still advertises a "Watch (in-app media view)" that no longer exists.

#### Proposed behavior

1. Error vs empty are mutually exclusive; a partial-load/`loadMore` failure shows an inline retry,
   not a toast-only.
2. Thumbnail ladder + skeleton + placeholder; no layout shift.
3. `aria-live` for loading/status text; `aria-label` on the unread dot; focus-visible actions kept;
   Refresh disabled/busy while loading.
4. Keyboard: Escape returns to Library from a section; optional section-switch shortcuts
   (e.g. `g x` / `g y` or Cmd/Ctrl+1..4) documented in the UI; search shortcut activates the
   section search once WP6 lands.
5. Fix the `Features.md` drift.

#### Technical approach

- Localized render changes; reuse `useGlobalShortcuts` with a view-aware scope rather than
  duplicating handlers.
- Styles: skeleton uses the existing surface tokens; ladder in `YouTubeCard` with `onError` chaining.

#### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | A first-load failure shows only the error state; empty and error never coexist. |
| AC2 | Loading-more and status changes are announced; the unread indicator has an accessible name. |
| AC3 | Escape returns to the library from both sections; search is reachable by keyboard once WP6 lands. |
| AC4 | Thumbnails render without pop-in and degrade through the quality ladder. |

#### Risks

- View-aware shortcut scoping must not regress the library's existing bindings.

---

### WP10 — Notifications & feedback consistency

**Priority: Medium · Effort:** S–M · **Area:** `capture-service`, `x-capture-service`, `SyncBanner`, `Sidebar`, settings

#### Evidence

- The persistence notification is generic: `showCaptureNotification(title ?? url)`
  (`capture-service.ts:88-92,234`); X posts get a URL-bodied "Link saved" because their title is null
  at drain (`capture-service.ts:187-213`). The tweet's related link is a second library capture that
  notifies again.
- X capture completion/failure never notifies (`x-capture-service.ts` has no `Notification` usage);
  failures appear only in `SyncBanner` while the app is open.
- `SyncBanner` counts failed outbox items of all kinds and "Retry all" retries all kinds
  (`SyncBanner.tsx:6,12-32`) but its copy says "links" with no kind indication.
- Delete feedback: library undo bar (no toast), YouTube silent, X capture-delete toast
  (`x-store.ts:109-117`) — three patterns.

#### Proposed behavior

1. X persistence notification uses author/tweet text when available; avoid double-notifying for the
   related-link capture when it stems from an X post (or coalesce).
2. Capture completion/failure for X (and any future section capture) produces one consistent signal,
   respecting the existing notification preference.
3. `SyncBanner` copy distinguishes sections (e.g. "1 X post and 2 links failed to save").
4. One feedback pattern per action across sections: delete → undo bar; metadata refresh → toast on
   real change; capture retry → busy → success/failure.

#### Technical approach

- Extend the post-persist hook payload with kind/author/text (or add a follow-up notification once
  X metadata lands) and reuse `notifyOnLinkCapture`.
- Deduplicate notifications by capture lineage (related link) via a flag on the enqueued outbox item.
- `SyncBanner` maps outbox items through `classifyLinkKind` for wording.

#### Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | "Link saved" for an X post shows the author/text, not the raw URL, and related-link captures don't double-notify. |
| AC2 | Capture completion/failure produces at most one consistent user-visible signal. |
| AC3 | Sync banner failure copy names the affected section(s). |
| AC4 | Delete/refresh feedback patterns are consistent between library, X, and YouTube. |

#### Risks

- Notification lineage tracking adds hidden state to the outbox; keep it optional and tested.

---

## 4. Sequencing

| Order | Package | Why first |
|---|---|---|
| 1 | WP1 X capture state truth | Trust: failures must be visible and actionable; smallest effort, highest perceived correctness. |
| 2 | WP9 Section polish, accessibility & keyboard | Same files as WP1; bundle error/empty, aria, thumbnails. |
| 3 | WP2 X post lifecycle | Removes the delete dead end; establishes the shared undo pattern for WP4. |
| 4 | WP4 YouTube lifecycle & read semantics | Same undo/read patterns; supersedes spec decision 6. |
| 5 | WP6 In-section search/filter/sort | Highest structural UX value; YouTube is nearly free, X needs one migration. |
| 6 | WP8 Per-kind counts & badges | Makes the sections queue-aware on top of WP4/WP6 state. |
| 7 | WP3 X card content & viewer | Content quality once lifecycle/findability are right. |
| 8 | WP5 YouTube enrichment & card upgrade | Largest change (migration + parser); independent of the rest. |
| 9 | WP7 Bulk selection & actions | Scales triage once filters/sort exist. |
| 10 | WP10 Notifications & feedback consistency | Cross-cutting cleanup; benefits from WP2/WP4/WP5 signals. |

## 5. Test surface

- `tests/unit/x-post-mapper.test.ts` — outbox status/error mapping (WP1).
- `tests/unit/x-capture-service.test.ts` / `handlers/x` tests — retry summary semantics, completion hook (WP1, WP3).
- `tests/unit/migrations-*.test.ts` — `x_post_list` search/sort params (WP6), `link_stats` per-kind
  counts (WP8), YouTube enrichment columns/side table (WP5).
- `tests/unit/link-repository.test.ts` / `link-stats.test.ts` — kind isolation intact, new stats mapping (WP6, WP8).
- `tests/unit/youtube-url.test.ts` — origin/playlist preservation (WP5).
- `tests/unit/metadata-parser.test.ts` — duration/channel parsing (WP5).
- Renderer tests for `XPostCard` (viewer keyboard, failed pending), `YouTubeCard` (watched toggle,
  ladder), selection helpers (WP7).
- Manual: offline copy on X screen; retry a failed render; delete+undo in both sections; search a
  50+ item section; keyboard-only triage.

## 6. Documentation updates

- `Features.md:382-383` — remove the stale "Watch (in-app media view)" claim for YouTube.
- `youtube-section.md` decision 6 — superseded: section deletes are undoable (WP2/WP4).
- `x-post-capture.md` — note the shipped post lifecycle (delete/archive/read) and the capture
  viewer; the "Copy post link" promise is now covered by WP3.
- `PARITY.md` — add the section parity items (delete/undo, read toggles, search).

## 7. Deferred / future work

- **Global/palette search reach into isolated kinds** (`search_links(p_kind => 'all')`): deferred by
  decision 2; revisit after WP6 ships per-section search.
- **Thread / quote context for X posts** (`x-post-capture.md:29-35`): still out of scope; requires a
  separate spec (multi-row capture/render/schema).
- **Dark-mode captures / theme-aware screenshots**: existing light-only decision stands
  (`x-post-capture.md:244`).
- **Continue-watching progress** (timestamped external open): needs a UX decision on progress entry;
  related to `Features.md` #4 resurfacing.
- **Channel grouping / "more from this channel"**: enabled by WP5's channel identity; UI follow-up.
- **Auto-render X captures on a new device**: keeps manual Capture/Retry for now.

## 8. Open questions

1. Should undo after deleting an X post attempt to preserve X metadata (currently reset to "no
   capture"; re-capture required)? Current plan: accept re-capture with clear copy.
2. Watched state for videos: reuse the library's `markReadOnOpen` setting with section-aware copy,
   or add a video-specific preference?
3. For WP8, should sidebar badges show unread-only or `unread/total` (and archived split)?
4. For WP5, columns vs `link_youtube` side table — accept either; decide during implementation based
   on field growth.
5. Notifications: is a capture-completion notification wanted at all, or is an in-app toast enough?
