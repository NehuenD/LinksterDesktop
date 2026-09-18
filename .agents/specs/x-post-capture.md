# Spec: X Post Capture — Isolated X Section, Tweet Screenshots & Related Links

> **Status:** Implemented — all tracer bullets complete (2026-09-17)
> **Feature:** New (follow-up to `Features.md`; independent of Features 1–5, builds on the outbox-era architecture)
> **Language/format:** English / Markdown
> **Depends on / touches:** `capture-service` (outbox drain), `link-repository` / `link-mapper`, `url-normalizer` / `url-validator`, `metadata-service`, new `x-capture-service` + `x-capture-repository` + `x-embed` + `x-card-html` + `x-capture-render`, `store`, IPC contract + preload + handlers, renderer (`ui-store`, `Sidebar`, new `XScreen` / `XPostCard` / `x-store`), Supabase migration `0008_x_posts.sql` (`links.kind`, `link_x_posts`, `search_links`, `link_stats`, `x_post_list`)

---

## 1. Goal & Rationale

X (Twitter) posts captured by the clipboard watcher are treated like any other link today: the HTML fetch hits a login wall, so they land in the library with no meaningful metadata, and a post's screenshot / embedded-link context is lost. Links that only exist as tweets (announcements, threads, quote sources) are exactly the content a read-later app should preserve well.

**Definition of success:** capturing an `x.com` / `twitter.com` status URL saves the post, keeps it out of the normal library, and files it in a dedicated **X** section with (a) a local PNG screenshot of the rendered tweet, (b) author / text / posted-at metadata, and (c) the first external link inside the tweet saved to the library as a related link.

## 2. Scope

**In scope**

- Recognition + canonicalization of X post URLs (x.com / twitter.com mirrors, `/status(es)/<id>`, tracking params) so mirrors dedupe to one post.
- `links.kind = 'link' | 'x-post'`, excluded from the library grid, search, mark-all-read, and stats; X count in `link_stats`.
- `link_x_posts` 1:1 metadata + capture-state table (author, text, posted-at, capture status/error, related URL/FK).
- A durable local **X capture queue**: after the post is persisted, fetch oEmbed metadata, render the tweet in a hidden sandboxed window, capture a PNG into `userData/x-captures/<linkId>.png`, with backoff, restart survival, and visible retry.
- Fallback card render (oEmbed HTML/text) when the official embed is unavailable; the post is saved even when capture fails.
- First external link extraction (t.co expansion, media/internal filtered) → enqueued through the existing outbox as a normal library link → related to the post.
- New **X screen** (sidebar entry, grid of captures, preview, open / reveal / retry / delete).
- SSRF validation for every new outbound fetch; sandboxed, cookie-free render window.

**Out of scope**

- Thread stitching, quote-tweet capture, polls, video download.
- Syncing capture PNGs across devices or into Feature 5 backup archives (v1 is local-only; see §6.4).
- Searching within the X section; multiple related links per post; auto-capture of imported X links.
- Changes to the existing Screenshots gallery.

## 3. Architectural Seams

### 3.0 Architecture decisions

- Screenshot primary source is the **official embed page** (`platform.twitter.com/embed/Tweet.html?id=<tweetId>`), which renders media/avatar/card without auth; fallback is a **self-rendered card** built from oEmbed data when the embed fails or is rate-limited. Metadata (author, text, date) always comes from oEmbed.
- Captures are rendered by a **hidden, hardened, in-memory-partition `BrowserWindow`** and written as PNGs under `userData/x-captures/`; no Supabase Storage, no binary backup payloads in v1.
- Post capture is **decoupled from the outbox drain**: persisting the link is the durability boundary; a persisted local job queue handles rendering/retries so a slow render can never block or fail a capture.
- Isolation uses a first-class `links.kind` column (fast filters, indexed) rather than URL heuristics at query time.

### 3.1 URL detection & canonicalization (`src/shared/lib/x-url.ts`, pure, shared)

```ts
export interface XPostRef {
  tweetId: string       // '20'
  handle: string | null // 'jack' | 'i' | null
  canonicalUrl: string  // 'https://x.com/<handle|i>/status/<tweetId>'
}

/** Null for non-post X URLs (profiles, search, lists) and non-X hosts. */
export function parseXPostUrl(raw: string): XPostRef | null

/** Stable dedupe/canonical form: X mirrors → canonical; other URLs unchanged. */
export function canonicalizeLinkUrl(raw: string): string

export function classifyLinkKind(rawUrl: string): 'link' | 'x-post'
```

Rules: hosts `x.com`, `twitter.com` plus `www.`/`mobile.` variants; paths `/<handle>/status(es)/<digits>` and `/status(es)/<digits>`; handle `[A-Za-z0-9_]{1,15}` or `i`; query/fragment ignored (so `?s=20` / `ref_src` variants collapse). `prepareCapture` canonicalizes **before** `normalizeUrl`, `linkExists`, and enqueue so `x.com/a/status/1`, `twitter.com/b/status/1`, and `/i/status/1` are one capture.

### 3.2 Data model — `supabase/migrations/0008_x_posts.sql`

1. **`links.kind`** (`text NOT NULL DEFAULT 'link'`, CHECK in `('link','x-post')`), backfilled for existing X rows; `idx_links_user_kind`.
2. **`link_x_posts`** (1:1 with `links`, same side-table precedent as `link_content`):

```sql
link_id uuid PRIMARY KEY REFERENCES links(id) ON DELETE CASCADE
user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
tweet_id text NOT NULL
author_handle text; author_name text; text text; posted_at timestamptz
capture_status text NOT NULL DEFAULT 'none'   -- none|pending|ok|failed
capture_error text; captured_at timestamptz
related_url text; related_link_id uuid REFERENCES links(id) ON DELETE SET NULL
created_at timestamptz NOT NULL DEFAULT now(); updated_at timestamptz NOT NULL DEFAULT now()
```

Unique `(user_id, tweet_id)`, RLS owner policy mirroring `link_content`, and intentionally **not** added to the realtime publication.

3. **`search_links`** gains `p_kind text DEFAULT 'link'` (and returns `kind`); `'all'` disables the filter.
4. **`link_stats`** counts only `kind = 'link'` and adds `x_posts bigint`.
5. **`x_post_list(p_limit, p_offset)`** returns joined rows (link fields + `link_x_posts` fields + `related_title` / `related_link_url`), with `total` via `count(*) over ()`.
6. **`linkster_resolve_x_related_links()`** (SECURITY INVOKER) sets `related_link_id` where `related_url` now matches an existing normalized link.

All statements idempotent, with `NOTIFY pgrst, 'reload schema'`; `tests/unit/migrations-x-posts.test.ts` mirrors the existing migration-test style.

### 3.3 Contract & repository plumbing (all additive)

- `Link` gains `kind: LinkKind`; `LinkKindSchema = z.enum(['link','x-post'])`; `LinkQuerySchema.kind?: 'link' | 'x-post' | 'all'`.
- `LinkStats` gains `xPosts: number` (drives the sidebar count).
- `LINK_COLUMNS` + `LinkRow` + `mapLinkRow` map `kind` (default `'link'` for tolerance).
- `createLink` and `insertRecords` (bulk import/restore) compute `kind: classifyLinkKind(url)`; `buildLinkUpdatePayload` does **not** expose `kind`.
- `listLinks` / `markAllRead`: `kind = query.kind ?? 'link'` → `.eq('kind', kind)` unless `'all'`; `searchLinks` forwards `p_kind`.
- `prepareCapture` stores the canonical URL; `linkExists` checks it.
- New helpers: `getLinkByNormalizedUrl` (relation resolution) and `listLinkKinds(ids)` (deletion cleanup).
- Exports include `kind`; `BackupLinkSchema` gains optional `kind` (format stays v1, tolerant parse). Local PNGs are not backed up (§6.4).

### 3.4 Capture path integration

- `runDrainPass` skips `fetchPageData` / `upsertLinkContent` for `kind = 'x-post'` (the X HTML is a login wall), creates the link with `siteName: 'X'`, then fires a hook:

```ts
export interface LinkPersistedEvent { id: string; url: string; kind: LinkKind }
export function setLinkPersistedHook(hook: ((event: LinkPersistedEvent) => void) | null): void
```

- `src/main/services/x-capture-instance.ts` (mirrors `reader-instance.ts`) imports both services, wires the hook → `enqueueXCapture` + drainer trigger, and builds the singleton with production deps. **No service-to-service import cycle** (capture-service does not import x-capture).
- `links:create` handler also enqueues when `classifyLinkKind(url) === 'x-post'` (Add Link dialog path).

### 3.5 X capture queue, service & rendering

- `src/main/data/x-capture-repository.ts` — persisted jobs (dedicated `electron-store` file `x-captures`, adapter seam like `outbox-store.ts`):

```ts
export interface XCaptureJob {
  linkId: string; url: string; tweetId: string
  status: 'pending' | 'failed'; attempts: number
  nextAttemptAt: number | null; lastError: OutboxError | null
  createdAt: string; updatedAt: string
}
```

- `src/main/services/x-embed.ts` (pure): `parseXOEmbed(tweetId, json)` → `{ authorName, authorHandle, text, html, externalLinks, postedAt }`; `xPostExternalLinks(html)` keeps ordered external anchors and drops mentions, hashtags, `pic.x.com` / `pic.twitter.com` media, and the status permalink; `expandTcoLink(url)` follows redirects with `validateUrl` + `assertPublicHost` per hop.
- `src/main/services/x-card-html.ts` (pure): `buildFallbackCardHtml(input)` — inline-CSS card (author, text, date, related hint), no scripts or remote resources.
- `src/main/services/x-capture-render.ts` (Electron): hidden `BrowserWindow` (550×900, `show: false`, `sandbox: true`, `contextIsolation: true`, no preload, non-persistent partition, `backgroundThrottling: false`); loads the embed URL (`theme=light`), waits for the rendered card + image settle (bounded ~10s), measures height, `capturePage()` → PNG; when the embed fails, loads the fallback card from a temp file inside the capture dir. Window hardened: popups denied, navigation denied after load, permission requests denied, audio muted; the partition's storage is cleared after each pass.
- `src/main/services/x-capture-service.ts`:

```ts
export function enqueueXCapture(link: { id: string; url: string }): XCaptureJob
export async function retryXCapture(linkId: string): Promise<void>
export function removeXCaptures(linkIds: readonly string[]): void          // PNG + job
export function getCaptureThumbnailDataUrl(linkId: string): string | null
export async function runXCapturePass(): Promise<XCaptureSummary>          // serialized via createDrainGate
```

Per-job steps: oEmbed (bounded read, JSON only) → render/capture primary + fallback → atomic PNG write → upsert `link_x_posts` (`capture_status = 'ok'`) → fill blank link fields (`title` / `description` / `author` / `siteName`, never overwriting user edits) → related link. Failures use `computeBackoffDelay` with `MAX_X_CAPTURE_ATTEMPTS = 6`; terminal failures set `capture_status = 'failed'` + `capture_error` and keep the local job for Retry. The pass is driven by a second `createOutboxDrainer` instance in `src/main/index.ts` (start + trigger on boot, trigger on realtime `SUBSCRIBED`, on demand) and broadcasts `x:changed` / `links:changed`.

Thumbnails: main-side `nativeImage` resize (256px) → data URL, mtime-cached like `screenshot-service.ts`.

### 3.6 Related link (first external link in the tweet)

- During the capture pass, the first result of `xPostExternalLinks` that expands (through `expandTcoLink`) to a public, non-X / non-media URL is recorded on `link_x_posts.related_url`.
- If a link with that normalized URL already exists, `related_link_id` is set immediately; otherwise the URL is enqueued through the **existing outbox** (`prepareCapture(url, { label: 'X' })`) — durable even if offline — and `linkster_resolve_x_related_links()` resolves the FK whenever the X list is read.
- Related links are normal library links (metadata, reader content, dedupe, archive/read state). Deleting the post keeps the related link; deleting the related link clears the FK but keeps `related_url` on the card.

### 3.7 IPC contract, preload, handlers

```
x:list             → IpcResult<XPostList>       // merges pending outbox X items + persisted posts
x:retry-capture    (linkId) → IpcResult<true>
x:reveal-capture   (linkId) → IpcResult<true>   // shell.showItemInFolder
x:open-capture     (linkId) → IpcResult<true>   // shell.openPath
x:delete-capture   (linkId) → IpcResult<true>   // PNG only
x:get-capture      (linkId) → IpcResult<{ dataUrl: string } | null>
x:changed          → push
```

```ts
export type XCaptureStatus = 'none' | 'pending' | 'ok' | 'failed'

export interface XPost {
  linkId: string | null; outboxId: string | null
  url: string; tweetId: string
  authorName: string | null; authorHandle: string | null
  text: string | null; postedAt: string | null; savedAt: string
  isRead: boolean
  captureStatus: XCaptureStatus; captureError: string | null; capturedAt: string | null
  thumbnailUrl: string | null
  relatedUrl: string | null; relatedTitle: string | null; relatedLinkId: string | null
}

export interface XPostList { items: XPost[]; total: number }
```

New `src/main/ipc/handlers/x.ts` registered in `ipc/index.ts`; preload `api.x = { list, retryCapture, revealCapture, openCapture, deleteCapture, getCapture, onChanged }`; all requests use `IpcResult` + `secureHandle`; file access is restricted to `userData/x-captures/` (mirrors `isWithinFolder` in `screenshot-service.ts`).
`links:delete` / `links:bulk-delete` handlers clean up capture files/jobs for deleted X links (best-effort).

### 3.8 Renderer — X section

- `ui-store.AppView` gains `'x'`; `Sidebar` gains an **X Posts** entry with the `stats.xPosts` count; `HomeScreen` routes `view === 'x'` → `XScreen`.
- `XScreen.tsx`: header (back to Library, "X", count, Refresh, "Captures are stored locally"), error/empty states reusing `EmptyState`, grid of `XPostCard`.
- `XPostCard.tsx`: capture thumbnail (or placeholder), author `@handle · relative date`, clamped text, status chip (`Queued locally` / `Capturing…` / `Capture failed`), related-link chip (`Contains link → <title/domain>`), hover actions: Preview, Open on X, Reveal capture, Copy post link, Retry (failed), Delete (ConfirmDialog). Pending cards (still in the outbox) show a spinner + Discard.
- `x-store.ts` (zustand): `items / total / status / error / load / retryCapture / reveal / open / remove / discardPending`, subscribes `api.x.onChanged`; opening a post honors `markReadOnOpen`.
- Preview uses the existing modal primitives plus `x:get-capture` for the full-size data URL.

### 3.9 Library isolation & pending handling

- Library queries default to `kind = 'link'` (grid, pagination, mark-all-read, command palette, counts).
- `HomeScreen` filters pending cards through `parseXPostUrl` so queued X posts appear only in the X section.
- `ScreenshotsScreen`, labels, and existing flows are untouched.

### 3.10 Security

- oEmbed / t.co requests: http(s) only, `assertPublicHost` before each hop, redirect cap 5, response cap 256KB, 15s timeout.
- Render window: sandboxed, no preload, non-persistent partition, popups/navigation/permissions denied, no `executeJavaScript` with interpolated remote data; temp render files live inside the capture dir and are removed after use.
- Capture paths are re-validated against the capture root on every read/delete (mirrors `isWithinFolder`).
- Captures are personal-use local artifacts; only textual metadata is stored in Supabase.

## 4. Acceptance Criteria

| # | Criterion | Verified by |
|---|---|---|
| AC1 | Copying an `x.com`/`twitter.com/<handle>/status/<id>` URL saves it and it appears **only** in the X section — never in the library grid, search, or stats. | Slice 1 unit + manual/e2e |
| AC2 | `x.com/a/status/1`, `twitter.com/b/status/1`, and `/i/status/1` mirrors dedupe to one post. | Slice 1 `x-url` unit + capture test |
| AC3 | Each captured post shows a PNG screenshot in the X section; Reveal/Open act on `userData/x-captures/<linkId>.png`. | Slice 2 manual + handler test |
| AC4 | Capture failures (offline, embed blocked, deleted post) never lose the post; status is visible with Retry, and pending jobs resume after restart. | Slice 2 repository/service tests + manual offline |
| AC5 | A tweet containing an external link saves that link to the library, deduped through the normal path, and the post card links to it. | Slice 3 `x-embed` test + manual |
| AC6 | Deleting a post removes its local PNG/job but not the related link; deleting the related link keeps the post card usable. | Slice 3 handler test + manual |
| AC7 | Mark-all-read never touches X posts; the sidebar X count equals the number of X posts. | Slice 1 migration/repository tests |
| AC8 | Export/backup round-trip preserves `kind`; imported X links appear in the X section with status `none` and can be captured on demand. | Slice 3 export/import test |

## 5. Tracer Bullet Breakdown

Each slice is a vertical end-to-end cut that is demonstrably working before the next begins.

### Slice 1 — X links recognized and isolated (no screenshot yet)

`src/shared/lib/x-url.ts`; migration `0008` (`kind` + `link_x_posts` + `search_links.p_kind` + `link_stats.x_posts` + `x_post_list` + `linkster_resolve_x_related_links`) with migration tests; contract additions (`LinkKind`, `Link.kind`, `LinkQuery.kind`, `LinkStats.xPosts`, `XPost`, `IPC.x`); link-repository / link-mapper plumbing + canonicalization in `prepareCapture`; drain skips the HTML fetch for X posts and fires `setLinkPersistedHook`; `x-capture-repository` + minimal `x-capture-service` (persist oEmbed metadata into `link_x_posts`, statuses `pending`/`none`); `handlers/x.ts` list; renderer `ui-store.view = 'x'`, Sidebar entry, `XScreen` text grid, library isolation + pending filter; `x-capture-instance` wiring.
**Done when:** an X URL captured twice via different mirrors yields exactly one post visible only in the X section, library/stats/search are unaffected, and non-X flows are unchanged.

### Slice 2 — Screenshot rendering, storage, previews, retries

`x-embed.ts` (oEmbed parsing) + `x-card-html.ts` + `x-capture-render.ts` (hidden-window embed capture + fallback card); atomic PNG writes under `userData/x-captures/`; capture status transitions, backoff, max attempts, local job retry; second drainer in `main/index.ts` + `x:changed` broadcasts; thumbnail and `x:get-capture` handlers; `x-store` + `XPostCard` preview/status/retry/delete actions; restart resume.
**Done when:** every captured post shows a real tweet screenshot (media included when public), the embed fallback works, capture survives offline → online, and terminal failures show an actionable Retry (AC3, AC4).

### Slice 3 — Related links, cleanup, polish

t.co expansion + external-link selection; `related_url` / `related_link_id` + resolution RPC use in `x:list`; related-link enqueue through the outbox; related chip on the card; deletion cleanup in `links:delete` / `bulk-delete`; pending X cards (Discard) and duplicate-filtering of library pendings; export/backup `kind`; sidebar count wiring; docs note in `Features.md`; full test surface below.
**Done when:** tweet links land in the library and are visible on the post card, deletion leaves no orphan captures, and export/import preserves X posts (AC5, AC6, AC8; AC7 verified end-to-end).

## 6. Decisions (confirmed with the user 2026-09-17)

1. **X posts are excluded from the library** — dedicated X section only; `links.kind` + `p_kind`/stats filters enforce it.
2. **First external link only** is saved as the related link under an automatic **`X` label** (so it never mixes into `General`), and the relation surfaces on the post card (a library-card badge is deferred).
3. **Tweet screenshots live in `userData/x-captures/`** — local-only v1, not in backups, not in the OS gallery.
4. **Embed-first capture with a local fallback card**; oEmbed supplies all metadata.
5. **Capture is a separate durable queue**, not part of the outbox drain, so rendering can never block or fail a capture.
6. **Canonical URL is `https://x.com/<handle|i>/status/<id>`**; captures dedupe by canonical URL (the DB unique index is unchanged).
7. **Reader content is skipped for X posts**; the screenshot is the reading artifact.
8. **Deleting a post cascades `link_x_posts`** (undo restores the link but not X metadata; re-capture is available).
9. **Capture theme is light**; media is rendered from the official embed.

## 7. Risks

- X embeds/oEmbed are rate-limited and semi-documented; endpoint changes are already visible (`publish.x.com`, `platform.x.com`, `pic.x.com`) — keep endpoints a tolerant list and the fallback card always available.
- Login-walled, age-restricted, or deleted tweets render nothing; status must degrade to `failed` with retry rather than saving a blank PNG (validate the capture is non-empty and above a minimal size).
- `links.kind` requires the migration before the app update; a missing column breaks every link query (call this out in release notes, same as previous migrations).
- Disk growth: captures are user data and are not auto-pruned; per-card delete is the control, and the folder is documented.
- A second `electron-store` file and a second drainer add startup wiring; keep `x-capture-instance.ts` the single wiring point.
- t.co expansion adds one outbound request per link; cap at the first external link and 5 redirects, validating every hop.
- Privacy: captures never leave the device; oEmbed metadata does sync via `link_x_posts` (disclose in release notes).
- Related links are best-effort across backup/restore (URL is persisted; the FK resolves when the link exists).

## 8. Test Surface

- `tests/unit/x-url.test.ts` — hosts/paths, handle rules, canonicalization, non-post URLs, mirror dedupe.
- `tests/unit/x-embed.test.ts` — oEmbed parsing (sample from `publish.twitter.com`), link filtering (mentions/hashtags/media/permalink), date parsing, t.co expansion with injected fetch, malformed payloads.
- `tests/unit/x-card-html.test.ts` — fallback card contains text/author, escapes HTML, no scripts/remote assets.
- `tests/unit/x-capture-repository.test.ts` — enqueue/dedupe/attempts/backoff/requeue/remove, schema tolerance.
- `tests/unit/x-capture-service.test.ts` — pass orchestration with injected deps: success path, metadata enrichment never overwrites user edits, failure → backoff → terminal failed, related-link enqueue/resolution, capture-file cleanup.
- `tests/unit/migrations-x-posts.test.ts` — idempotency, RLS policy, `search_links`/`link_stats`/`x_post_list` definitions, `NOTIFY pgrst`.
- `tests/unit/link-mapper.test.ts`, `link-repository-search.test.ts`, `url-normalizer.test.ts` (extend) — kind defaults, query/filter behavior, canonical dedupe.
- `tests/e2e/smoke.spec.ts` (extend, optional) — sidebar entry opens the X view.
- Manual: embed rendering for text/media/link/quote tweets, deleted tweet, offline capture → retry, restart resume, multi-display capture window, delete/undo flows.

## 9. Implementation Notes (2026-09-17)

- Delivered files: `src/shared/lib/x-url.ts`; `supabase/migrations/0008_x_posts.sql`; `src/main/data/{x-capture-repository,x-capture-store,x-post-repository}.ts`; `src/main/services/{x-embed,x-oembed-fetch,x-card-html,x-capture-render,x-capture-files,x-capture-thumbnail,x-capture-service,x-capture-instance,x-post-mapper,http-read}.ts`; IPC `x:*` handlers + preload `api.x`; renderer `x-store`, `XScreen`, `XPostCard`; `links.kind` plumbing through contract/repository/mapper/exports/backups.
- The capture queue is drained by a second `createOutboxDrainer` in `main/index.ts` (boot trigger, realtime `SUBSCRIBED` trigger, 30s tick) and broadcasts `x:changed`.
- `x:list` resolves related links opportunistically (`linkster_resolve_x_related_links`), merges queued outbox captures as pending cards, and prunes the thumbnail cache to the visible set.
- `links:delete` / `links:bulk-delete` remove capture files and jobs for X posts.
- Manual verification still required for the Electron-only paths: embed rendering quality for media/quote/deleted tweets, `capturePage` sizing across displays, and the fallback card path.
