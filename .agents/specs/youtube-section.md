# Spec: YouTube Section — Isolated Video Links

> **Status:** Implemented (2026-09-17)
> **Feature:** Follow-up to the X post capture feature (`x-post-capture.md`); reuses the `links.kind` isolation pattern
> **Language/format:** English / Markdown
> **Depends on / touches:** `capture-service` (canonicalization + drain classification), `link-repository` / `link-mapper`, new `youtube-url` + `link-url` shared libs, IPC contract, renderer (`ui-store`, `Sidebar`, new `YouTubeScreen` / `YouTubeCard` / `youtube-store`), Supabase migration `0009_youtube_section.sql`

---

## 1. Goal & Rationale

YouTube links currently land in the main library as `media` pages (they show a "Watch" badge and open the in-app media view). They dominate a read-later library and deserve the same isolation X posts already get: a dedicated **YouTube** section with a sidebar count, excluded from library lists, search, and stats.

No capture pipeline work is needed: video metadata (title, channel, thumbnail, description) already arrives through the normal OG fetch, so the section renders directly from the existing `links` row.

## 2. Scope

**In scope**

- Recognition + canonicalization of YouTube video URLs (`watch?v=`, `youtu.be`, `/shorts/`, `/embed/`, `/live/`, `m.`/`music.` mirrors) so variants dedupe to one row.
- `links.kind = 'youtube'`, excluded from the library grid, search, and stats; YouTube count in `link_stats`.
- New **YouTube** sidebar entry + screen: 16:9 thumbnail grid, unwatched dot, archive badge, Open on YouTube, Archive/Unarchive, Delete.
- Queued captures for videos show in the YouTube section (reusing `PendingLinkCard`) and no longer leak into the library's pending strip.

**Out of scope**

- Local video captures/screenshots (the remote thumbnail is used as-is; per user decision).
- Related links from video descriptions.
- Playlists, channels, and other non-video YouTube URLs (they stay regular library links).
- **In-app viewing**: removed 2026-09-17 (user decision) — the in-app media view renders poorly in unmaximized windows and is not a player, so the card opens videos on YouTube and offers no Watch action.

## 3. Architectural Seams

### 3.1 URL detection & canonicalization

- `src/shared/lib/youtube-url.ts` (pure):
  ```ts
  export function isYouTubeHost(host: string): boolean
  export function parseYouTubeVideoUrl(raw: string): { videoId: string; canonicalUrl: string } | null
  ```
  Hosts: `youtube.com`, `www.`, `m.`, `music.`, `youtube-nocookie.com`, `youtu.be` (+ `www.`). Paths: `/watch?v=<id>`, `/shorts/<id>`, `/embed/<id>`, `/live/<id>`, `youtu.be/<id>`. The 11-char `[A-Za-z0-9_-]{11}` id is validated; tracking params (`t`, `si`, `list`) are dropped. Canonical: `https://www.youtube.com/watch?v=<id>`.
- `src/shared/lib/link-url.ts` (pure, combined):
  ```ts
  export function canonicalizeLinkUrl(raw: string): string
  export function classifyLinkKind(rawUrl: string): LinkKind   // 'link' | 'x-post' | 'youtube'
  ```
  `prepareCapture` canonicalizes before dedupe/enqueue, so `youtu.be/x`, `shorts/x` and `watch?v=x` collapse to one capture; `classifyLinkKind` drives the insert-time `kind`.

### 3.2 Contract

- `LinkKindSchema = z.enum(['link','x-post','youtube'])`; `LinkKindFilterSchema` gains `'youtube'`.
- `LinkStats` gains `youtube: number` (sidebar count).
- `BackupLink.kind` now uses `LinkKind` (export/backup carry the new kind).

### 3.3 Migration `0009_youtube_section.sql`

1. Extend `links_kind_check` to `('link','x-post','youtube')`.
2. Backfill existing YouTube video rows (`kind = 'link'` only) matching the same URL shapes.
3. Recreate `link_stats` with `x_posts` **and** `youtube` counts; library totals still count `kind = 'link'` only.
4. `NOTIFY pgrst, 'reload schema'`. `search_links` needs no change (`p_kind` is generic).

### 3.4 Pipeline & repository

- Capture/drain: unchanged. YouTube links are fetched like regular links (OG metadata); the drain's X-only skip does not apply. The post-persist hook fires with `kind: 'youtube'`; no capture job is enqueued (the X pipeline filters to `x-post`).
- Library queries, `markAllRead`, and `link_stats` already filter by `kind`, so videos disappear from the library the moment the migration is applied.

### 3.5 Renderer

- `ui-store.AppView` gains `'youtube'`; `Sidebar` gains a **YouTube** entry with the `stats.youtube` count; `HomeScreen` routes the view and filters the library pending strip to `classifyLinkKind(url) === 'link'`.
- `youtube-store.ts` (zustand): `items / status / error / hasMore / loadingMore / load / loadMore / open / toggleArchived / remove`; queries `api.links.list({ kind: 'youtube', sort: 'newest' })`; mutations reload the section and the library store (for sidebar counts); all calls go through `settleIpc` so IPC failures surface as toasts instead of hanging.
- `YouTubeScreen.tsx`: header (back, title, count, Refresh), error banner with Retry, infinite scroll, empty state, pending video cards, thumbnail grid.
- `YouTubeCard.tsx`: 16:9 thumbnail (remote `i.ytimg.com`), unwatched dot, archived badge, title, channel, relative time; hover actions Copy / Refresh / Archive / Delete (confirm dialog). Clicking the card opens the video externally and marks it watched per the reading preference.

## 4. Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | A copied YouTube URL (watch, youtu.be, shorts, embed, live) appears only in the YouTube section — never in library grid, search, or stats. |
| AC2 | `youtu.be/x`, `youtube.com/shorts/x`, and `youtube.com/watch?v=x` dedupe to one video. |
| AC3 | The section shows thumbnail, title, channel, relative time; the sidebar count matches the number of videos. |
| AC4 | Clicking the card opens the video externally and marks it watched; Copy puts the canonical URL on the clipboard. |
| AC5 | Archive/Unarchive, Delete, and pending-video cards work; failures surface as toasts (no silent hangs). |
| AC6 | Non-video YouTube URLs (channels, playlists) and other media hosts stay in the library. |

## 5. Decisions

1. **Metadata + thumbnail only** — no local capture pipeline for videos (user decision 2026-09-17).
2. **No side table** — video metadata already lives on `links`; isolation needs only `kind`.
3. **Only videos are isolated**; channels/playlists remain library links.
4. **Canonical form is `https://www.youtube.com/watch?v=<id>`**, matching the X precedent for mirror dedupe.
5. **Playback stays external** — the in-app media view was dropped (2026-09-17) because it is not a player and misrenders in unmaximized windows.
6. **Delete removes the link** (no undo toast in the section, matching the X card pattern).

## 6. Test Surface

- `tests/unit/youtube-url.test.ts` — hosts/paths, id validation, param stripping, canonicalization, non-video inputs.
- `tests/unit/link-url.test.ts` — combined canonicalization/classification (X + YouTube + passthrough).
- `tests/unit/x-url.test.ts` — X-only parsing after the split.
- `tests/unit/migrations-youtube.test.ts` — idempotent CHECK extension, backfill, `link_stats.youtube`, schema-cache reload.
- `tests/unit/link-stats.test.ts`, `link-mapper.test.ts`, `capture-service.test.ts` (extend) — `youtube` count mapping, kind tolerance, canonicalizing enqueue, drain classification for videos.
- Manual: copy a video link → appears in the section only; shorts/youtu.be dedupe; Watch/Archive/Delete; pending card while offline.
