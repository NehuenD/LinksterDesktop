# Spec: Reader Mode — Saved Article Content, Offline Reading & Full-Text Search

> **Status:** Approved — ready for `feature-executor` (2026-09-15)
> **Feature:** 2 of 5 in `Features.md` (Priority: High · Effort: L)
> **Source of truth:** `Features.md` §2 (rationale, proposed behavior, acceptance criteria), verified against the current implementation
> **Language/format:** English / Markdown
> **Depends on / touches:** `metadata-service`, `metadata-parser`, `url-validator`, `capture-service`, `data/link-repository`, `data/link-mapper`, IPC contract, Supabase schema (new migration `0003`), renderer links store + new reader view

---

## 1. Goal & Rationale

Linkster stores **metadata only** (`metadata-parser.ts` extracts title/description/image/site/type). It is therefore a bookmark manager, not a true read-later:

- Links cannot be read offline — nothing but metadata is persisted.
- Search covers only `title`/`description`/`url` via server-side `or(ilike…)` (`link-repository.ts:36-39`).
- The single strongest differentiator versus browser bookmarks — a clean, durable, searchable reading copy — is absent.

**Definition of success:** capturing an article saves a sanitized, self-contained readable copy; the reader view renders it (online or offline after first extraction); a phrase that appears only in the article body returns the link; **video/audio links open a proper media view instead of a broken article body**; and other non-article pages degrade gracefully without breaking capture.

## 2. Scope

**In scope**
- A pure, unit-testable **readability-style content extractor** with a sanitization allowlist.
- **Extraction during capture**: the HTML fetched for metadata is reused to extract article body, plain text, word count, and extraction status.
- **Separate content storage** (`link_content` 1:1 table) so list payloads and realtime events stay small.
- **Reader view** with app typography, adjustable font size/width, "Open original", and offline rendering from a local cache.
- **Full-text search** across title + description + url + article body (Postgres `tsvector`/GIN), with a "matched in article" facet.
- **Media links (video/audio)**: YouTube/Vimeo/Spotify/etc. are classified as `'media'`, never run through readability, and get a dedicated media view (poster/title/channel/description/Watch CTA).
- **Graceful degradation**: non-article/PDF pages stay metadata-only; extraction failures are recorded, never fatal.
- **SSRF/redirect hardening** (cross-cutting prerequisite) before fetching arbitrary page bodies.

**Out of scope (deferred)**
- **Offline full-text search** — v1 search stays server-side (Supabase). A local FTS index (SQLite) is a follow-up; only *reading* is offline in v1.
- Caching article **images** for offline (images stay remote; note limitation in UI).
- Object storage for oversized bodies (bounded inline storage in v1; see §3.3).
- Features 1, 3, 4, 5.
- Multi-device realtime propagation of *later* content changes (derived data; reload picks it up).

## 3. Architectural Seams

### 3.0 Prerequisite — SSRF / redirect hardening

`metadata-service.ts:66-73` fetches with `redirect: 'follow'`, so `validateUrl` only ever sees the *initial* URL; a public URL can redirect to `169.254.169.254` / `127.0.0.1` / a LAN host. `url-validator.ts:29` also only matches literal IPv4, not hostnames that resolve private. Fetching full page bodies makes this materially worse, so it ships first.

- Switch to `redirect: 'manual'` and follow **up to `MAX_REDIRECTS` (5)** hops in `metadata-service`, re-running `validateUrl` **and** a DNS check on every `Location`.
- Add `assertPublicHost(host)` to `url-validator.ts`: resolve via `node:dns/promises` `lookup({ all: true })` and reject if **any** address is private (reuse `isPrivateHost`); reject non-http(s) schemes and non-default ports (allow 80/443).
- Return `emptyMetadata()` + `extractionStatus: 'unsupported'` whenever a hop fails validation.

### 3.1 Content extractor (`src/main/services/content-extractor.ts`, pure)

Uses the already-present `node-html-parser`. Deterministic and unit-tested.

```ts
export type ExtractionStatus = 'ok' | 'media' | 'empty' | 'unsupported' | 'failed'

export interface ExtractedContent {
  contentHtml: string | null
  contentText: string | null
  wordCount: number
  status: ExtractionStatus
}

export function extractContent(root: HTMLElement, baseUrl: string): ExtractedContent
```

**Page classification first** — `classifyPage(metadata, url): 'article' | 'media' | 'other'`:
- `'media'` when `ogType` starts with `video.`/`music.`, or the host is a known media site (`youtube.com`, `youtu.be`, `vimeo.com`, `tiktok.com`, `twitch.tv`, `soundcloud.com`, `open.spotify.com`, …). **Short-circuits before the readability pass** so watch-page chrome is never mistaken for article text; returns `status: 'media'` with `contentHtml/contentText = null`. Video pages rely on OG metadata (title, description, image, author/channel) already parsed by `metadata-parser.ts`.
- `'other'` for non-HTML (PDF, images) → `status: 'unsupported'`.
- `'article'` → run the algorithm below.

Algorithm (article path):
1. **Strip noise**: `script, style, noscript, template, iframe, object, embed, form, input, textarea, select, button, svg, canvas, nav, header, footer, aside, [role=navigation], [aria-hidden=true]`, and ad/comment/share/related class heuristics.
2. **Score candidates**: `article, main, [role=main], .post, .article, .entry-content, .post-content, .content, #content, body`; score = total words in descendant `<p>` (bonus for `<article>`/`main`); pick the best.
3. **Threshold**: if best text `< MIN_WORDS (140)` → `status: 'empty'` (metadata-only), no body stored.
4. **Sanitize to allowlist**:
   - tags: `p,h1–h6,ul,ol,li,blockquote,pre,code,em,strong,b,i,a,img,figure,figcaption,hr,br,table,thead,tbody,tr,th,td,sup,sub`
   - attrs: `href,src,alt,title,width,height,colspan,rowspan` (strip `style,class,id,on*,data-*`)
   - resolve relative `href`/`src` against `baseUrl`; drop `javascript:`/`data:` URLs; drop `<img>` with width/height ≤ 2 (tracking pixels).
5. **Plain text** = candidate `.text` with whitespace collapsed; `wordCount` = whitespace-split count.
6. Bound payloads: `MAX_CONTENT_TEXT = 200_000`, `MAX_CONTENT_HTML = 400_000` chars (hard truncate).

### 3.2 Page fetch (`src/main/services/metadata-service.ts`)

Parse the fetched HTML once and derive both metadata and content:

```ts
export interface PageData { metadata: LinkMetadata; content: ExtractedContent | null }

// New: fetch once, validate redirects, parse root once.
export async function fetchPageData(rawUrl: string, overrides?: Partial<MetadataDeps>): Promise<PageData>
```

- `metadata-parser.ts` gains `parseMetadataFromRoot(root, url)`; `parseMetadata(html, url)` stays as a thin wrapper (keeps existing tests green).
- Non-HTML `content-type` → `content: null` (renderer treats as `'unsupported'`); a fetch/parse failure returns empty metadata + `content: null` (capture still succeeds).
- `fetchMetadata` is kept as `(await fetchPageData(url)).metadata` for compatibility.

### 3.3 Data model & migration (`supabase/migrations/0003_reader_content.sql`)

**Deliberate deviation from `Features.md` §2** (which proposed columns on `links`): bodies live in a **separate 1:1 table** so article text is never broadcast on the `links` realtime publication or pulled in list queries. Rationale + alternatives in §6. Small per-page metadata is added to `links` directly (`author text`, `site_name text`) — `metadata-parser` already extracts it and the reader/media view needs it.

```sql
create table if not exists public.link_content (
  link_id          uuid primary key references public.links(id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content_html     text,
  content_text     text,
  word_count       int,
  extraction_status text not null default 'none',
  extracted_at     timestamptz,
  content_tsv      tsvector generated always as (
    to_tsvector('english', coalesce(content_text, ''))
  ) stored
);

create index if not exists idx_link_content_tsv  on public.link_content using gin (content_tsv);
create index if not exists idx_link_content_user on public.link_content (user_id);

alter table public.link_content enable row level security;
create policy link_content_owner on public.link_content
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

`link_content` is **not** added to the `supabase_realtime` publication.

### 3.4 Repository & full-text search

**`link-mapper.ts` / `Link`**: `links` gains an embedded to-one `link_content(word_count, extraction_status)` in `LINK_COLUMNS`; `Link` gains:

```ts
wordCount: number | null
extractionStatus: 'ok' | 'media' | 'empty' | 'unsupported' | 'failed' | 'none'
readingTimeMinutes: number | null   // derived: max(1, round(wordCount / 225))
```

`extractionStatus` doubles as the renderer's **page kind**: `'ok'` → article reader, `'media'` → media view, `'empty' | 'unsupported' | 'failed' | 'none'` → metadata-only card/open-original.

Body columns are **never** in list/`Link` payloads — only the badge fields.

**Content read/write** (`link-repository.ts`):
- `upsertLinkContent(linkId, content, extractedAt)` — insert … on conflict (link_id) update.
- `getLinkContent(linkId): ReaderContentRow | null` — used by the reader.

**Search** (`link-repository.ts` + RPC): with a body table, cross-table FTS needs a join, so add an RPC that returns the `Link` shape plus a match facet:

```sql
create or replace function public.search_links(
  p_term text, p_filter text default 'all', p_label text default null,
  p_domain text default null, p_date_from timestamptz default null,
  p_date_to timestamptz default null, p_include_content boolean default true,
  p_limit int default 48, p_offset int default 0
) returns table ( /* links columns */ , word_count int, extraction_status text,
                  matched_in_content boolean, rank real )
language sql stable as $$ /* websearch_to_tsquery over title/desc/url + content_tsv, RLS-scoped */ $$;
```

- `listLinks` routes to `supabase.rpc('search_links', …)` only when `query.search` is non-empty; otherwise the existing PostgREST path is unchanged.
- `LinkQuerySchema` gains `searchContent?: boolean` (default implicitly true).
- `matched_in_content` is mapped to `Link.matchedInContent` and powers the **"matched in article" facet** badge on results.

### 3.5 IPC contract (`src/shared/contract/ipc.ts`, `preload/index.ts`, `handlers/links.ts`)

```
links:get-content (id) → ReaderContent | null     // cache → server → null
```

```ts
export interface ReaderContent {
  linkId: string
  url: string
  title: string | null
  description: string | null      // media fallback + article intro
  thumbnailUrl: string | null     // media poster / article hero
  siteName: string | null
  author: string | null           // channel/author
  contentHtml: string | null
  contentText: string | null
  wordCount: number | null
  readingTimeMinutes: number | null
  extractionStatus: 'ok' | 'media' | 'empty' | 'unsupported' | 'failed' | 'none'
  extractedAt: string | null
  fromCache: boolean
}
```

Reader payloads are self-contained (metadata + body) so the media/article view works **offline** without a second lookup. The search facet is a `Link`-level field instead: `matchedInContent?: boolean` is set on search results only (see §3.4).

- New preload method `api.links.getContent(id)`; handler uses `IpcResult`, validates `id` is a string.
- `links:refresh-metadata` is **extended** to re-fetch page data and upsert content (single "re-extract" path), still returning `Link`.
- `LinkQuerySchema.searchContent` is the only query change; no new push channel (content is derived; `links:changed` already forces reload).

### 3.6 Capture integration (`capture-service.ts`, `services/clipboard/capture-pipeline.ts`)

- Drain: `fetchMetadata` → `fetchPageData`; after `createLink`, call `upsertLinkContent` with `content`, `status`, `extractedAt`. Extraction failure never fails the capture (AC5).
- For `'media'`/`'unsupported'`, a `link_content` row is still written (status recorded, absent body) so classification and the media view survive; no body is stored.
- `createLink` payload unchanged; content is a second write. `23505` handling stays as-is.
- Manual add (`links:create`) remains metadata-only (no fetch today).

### 3.7 Local content cache (`src/main/data/content-cache.ts`, `services/reader-service.ts`)

- `ContentCacheAdapter { read(linkId); write(linkId, entry); remove(linkId); prune(max) }`; production adapter writes `userData/reader/<linkId>.json` (LRU-capped at 500 entries by mtime); in-memory adapter for unit tests.
- Cache entry is keyed by `extractedAt`; a mismatch invalidates.
- `reader-service.getLinkContent(id)`: cache hit → return (`fromCache: true`); else Supabase row → write cache → return; else `null`. Consecutive offline calls return the cache when present, enabling **AC2**.

### 3.8 Renderer

- **Store** (`ui-store.ts`): `readerLinkId: string | null`, `openReader(id)`, `closeReader()`.
- **`ReaderView.tsx`** (new, overlay): calls `api.links.getContent(id)` and switches layout on `extractionStatus`:
  - **Article** (`'ok'`): sanitized HTML body; header shows title, domain, `readingTimeMinutes`, "Open original" (→ `system:open-external`), close (Esc/backdrop); font-size +/− and column width persisted in a small renderer `reader-store` (localStorage).
  - **Media** (`'media'`, e.g. YouTube/Vimeo/Spotify/TikTok): a poster-driven media layout — thumbnail, title, channel/author, description, and a primary **"Watch on \<siteName\>"** CTA plus "Copy link". No readability body; no inline player embedded in v1 (see §6 decisions), so no third-party iframe/CSP surprises.
  - **Metadata-only** (`'empty' | 'unsupported' | 'failed' | 'none'`): title, description, thumbnail, "Open original".
- **`LinkCard.tsx`**: `'ok'` shows `Read · N min`; `'media'` shows a play/`Watch` affordance; card body likewise opens the reader/media view, otherwise current `openExternal` behavior is preserved. Hover actions gain "Original".
- **Search bar**: a small "Full text" toggle (default on) posting `searchContent`; results matched in the body show a subtle "article" badge. Video links remain searchable via title/description/url (already in `content_tsv`/the RPC's metadata arm).
- **Empty/unsupported state**: reader shows "No reader content for this page" with "Open original"; extraction failures are non-destructive.

### 3.9 Render-time sanitization (defense in depth)

- `src/renderer/src/lib/sanitize-article.ts`: `sanitizeArticleHtml(html)` using `DOMParser` + the same allowlist (strips `script/style/iframe`, `on*`, `javascript:`), applied before `dangerouslySetInnerHTML`. No new dependency.

## 4. Acceptance Criteria

| # | Criterion | Verified by |
|---|---|---|
| AC1 | Capturing a typical news/article URL yields stored readable content and a working reader view. | Slice 1/2 unit + manual |
| AC2 | The reader renders offline after the content has been extracted once. | Slice 2 cache test |
| AC3 | Searching a phrase that appears only in the article body returns the link. | Slice 3 RPC/query test |
| AC4 | Extracted HTML contains no `<script>`, inline event handlers, or remote tracking pixels. | Slice 1 extractor test |
| AC5 | Non-extractable URLs show a clear metadata-only state and do not break capture. | Slice 1 capture test |
| AC6 | Reading time is displayed and is within ±20% of a manual count on a sample set. | Slice 3 fixture test |
| AC7 | A YouTube/video link opens a **media view** (poster, title, channel/author, description, Watch CTA) and never renders watch-page chrome as an article body. | Slice 1 classifier + Slice 2 media test |

## 5. Tracer Bullet Breakdown

Each slice is a vertical end-to-end cut that is demonstrably working before the next begins.

### Slice 0 — SSRF / redirect hardening (prerequisite)
`url-validator.assertPublicHost` (DNS resolution + private-IP rejection); `metadata-service` manual redirects with per-hop re-validation and `MAX_REDIRECTS`.
**Done when:** a redirect to a private/reserved address is refused and returns empty metadata; covered by `tests/unit/metadata-service.test.ts` + `tests/unit/url-validator.test.ts`.

### Slice 1 — Extract → classify → store → retrieve (headless E2E)
Pure `content-extractor.ts` with `classifyPage` (+ `parseMetadataFromRoot`); `fetchPageData`; migration `0003` (`link_content`); `upsertLinkContent`/`getLinkContent`; `Link` badge fields + `LINK_COLUMNS` embed; drain integration; `links:get-content` IPC; content cache + `reader-service`.
**Done when:** capturing an article stores a sanitized body and `getContent` returns it (HTML has no scripts/handlers/pixels — AC4); a YouTube/PDF capture records `media`/`unsupported` and still creates the link without an article body (AC5, AC7); a mocked store re-open still serves content (AC2 groundwork). Targeted by new `content-extractor.test.ts`, `reader-service.test.ts`, and an extended drain test.

### Slice 2 — Reader + media view + offline
`ui-store` reader state; `ReaderView.tsx` (article + media + metadata-only layouts); renderer `sanitize-article.ts`; card `Read`/`Watch` affordance + click routing; font size/width prefs; offline rendering from cache with an explicit "content unavailable offline" state.
**Done when:** a captured article opens in a clean reader and renders with the network off after first extraction (AC1, AC2); a YouTube link opens the media view with poster/title/channel/description/Watch CTA (AC7).

### Slice 3 — Full-text search, facet & reading time
`search_links` RPC (title/description/url + `content_tsv`, RLS-scoped, ranked); `listLinks` routing + `searchContent`; "Full text" toggle + "matched in article" badge; reading time on cards; `refresh-metadata` re-extracts content.
**Done when:** a body-only phrase returns the link with the article facet (AC3) and reading time is within ±20% on the fixture corpus (AC6).

## 6. Decisions (for confirmation)

1. **Content storage — separate `link_content` table (recommended).** Deviates from `Features.md` §2's columns-on-`links`: keeping bodies off `links` prevents realtime from broadcasting article text to every device and keeps list queries light. Alternative: columns on `links` (simpler `or(...wfts...)` search, but heavy realtime/list payloads).
2. **Search implementation — `search_links` RPC.** Required because content lives in another table; returns a real `matched_in_content` facet and rank. Alternative: keep columns on `links` and use PostgREST `or(…,content_tsv.wfts(english)…)`.
3. **Offline search deferred.** v1 offline = reading only; server-side FTS assumed online.
4. **Card behavior.** Card body opens the **reader** when content exists (else browser as today); "Open original" moves into the reader + hover action.
5. **Re-extract path.** Fold content refresh into `links:refresh-metadata` (no new channel).
6. **Reader prefs** stored renderer-local (localStorage), not in `settings-service`.
7. **Video handling (confirmed in review).** Video/audio links are a first-class `'media'` page kind: classified up front, never run through readability, and presented in a media view (poster/title/channel/author/description, "Watch on \<site\>" CTA, Copy link). **OG-metadata media view only in v1** — no inline/embedded player and **no transcript extraction** (deferred: fragile, ToS-sensitive fetch).

## 7. Risks

- **Extraction quality** varies; needs a fixture corpus and graceful fallback (threshold → metadata-only). Keep the extractor pure for fast iteration.
- **Realtime gap:** `link_content` is not published, so later content edits don't propagate live; a list reload/refresh resolves it. Acceptable for derived data.
- **Storage cost:** inline bodies can grow the DB; caps bound a single article but not total volume. Object storage / retention is the follow-up.
- **Copyright/licensing:** personal offline reading only; consider a retention policy before shipping.
- **Images are not cached**, so offline reading is text-only unless remote images are reachable (media posters are OG images and share this limitation).
- **Media coverage:** only OG metadata is shown for videos/audio; no transcript, so video content is *not* full-text searchable beyond title/description/url. Inline/embedded playback is intentionally omitted to avoid third-party iframes and CSP/autoplay issues.
- **Classifier drift:** the known-media-domain list needs maintenance; unknown hosts fall back to readability (and, if too short, `'empty'`), which is safe but may show a metadata-only state for niche players.
- **`content_tsv` generated column** requires an IMMUTABLE expression — must use `to_tsvector('english'::regconfig, …)` explicitly and be validated on a real Postgres instance.
- **RPC + RLS:** function must run as invoker so ownership policies still apply; verify no `security definer` leakage.
- **SSRF fix** touches the shared fetch path used by Feature 1's drain; keep behavior identical for metadata to avoid regressions.

## 8. Test Surface

- `tests/unit/content-extractor.test.ts` — fixtures (article/news/product/PDF-ish/near-empty/**youtube-like**); AC4 (no script/handlers/pixels), AC6 (word count/reading time), AC7 (`classifyPage` → `'media'`, no body).
- `tests/unit/reader-service.test.ts` — cache hit/miss/invalidation, offline behavior (AC2).
- `tests/unit/metadata-service.test.ts` (extend) + `url-validator.test.ts` (extend) — Slice 0.
- `tests/unit/link-mapper.test.ts` (extend) — badge fields + reading time derivation.
- Slice 3 — search query construction/facet (mock `supabase.rpc`), plus a manual RPC check against a real instance.
