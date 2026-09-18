# Spec: Offline-First Capture Outbox with Retry & Conflict-Safe Sync

> **Status:** Draft — pending user review
> **Feature:** 1 of 5 in `Features.md` (Priority: High · Effort: M–L)
> **Source of truth:** `Features.md` §1 (rationale, proposed behavior, acceptance criteria), verified against the current implementation
> **Language/format:** English / Markdown
> **Depends on / touches:** `capture-service`, `clipboard-controller`, `clipboard/capture-pipeline`, `realtime-service`, `data/link-repository`, IPC contract, renderer links store

---

## 1. Goal & Rationale

Capture is the product's signature behavior and its least robust path. Today a capture can be **silently dropped**, and a flaky connection is indistinguishable from "nothing happened":

- `clipboard-controller.ts:49` swallows every failure: `void captureUrl(url).catch(() => undefined)`.
- `capture-pipeline.ts:36-38` records the SHA-256 hash of clipboard text **before** validation/persistence, so if the capture then fails (offline, expired session, RLS, Supabase 5xx), re-copying the same URL is ignored **for the rest of the session** with no retry.
- `realtime-service.ts:16-18` reconciles with strict last-write-wins: the renderer reloads server state, so a local read/archive toggle can be discarded by a stale remote snapshot.

**Definition of success:** every captured link is eventually persisted or explicitly surfaced to the user, queued work survives restarts, and reconciliation merges instead of truncating — while Supabase remains the single source of truth.

## 2. Scope

**In scope**
- A local, persisted **capture outbox** written before metadata fetch / DB insert.
- **Background drain** with exponential backoff + jitter, triggered on enqueue, app start, connectivity recovery, auth recovery, and realtime reconnect.
- **Pending and failed link state** visible in the library, with Retry / Discard.
- **Retryable dedup**: dedup keyed on persisted state (server row *or* outbox item), not on a permanent session hash.
- **Conflict-safe reconciliation**: preserve a newer local read/archive toggle against a stale remote snapshot; surface a conflict badge when a merge is ambiguous.
- Unit-testable pure modules for the outbox and merge logic.

**Out of scope**
- Moving off Supabase as the source of truth (still PostgREST + Realtime).
- Reader content, quick-capture hotkey, import/backup (Features 2–5).
- Fixing SSRF/private-IP gaps (`metadata-service.ts:67`, `url-validator.ts:29`) — a cross-cutting prerequisite tracked in `Features.md`, not part of this slice.
- Multi-device distributed transactions / CRDTs.

## 3. Architectural Seams

### 3.1 Data model — outbox item

```ts
// src/shared/contract/ipc.ts (new)
export type OutboxStatus = 'pending' | 'failed'

export interface OutboxItem {
  id: string                 // local randomUUID; distinct from the eventual server Link id
  url: string                // validated, canonical (validateUrl output)
  normalizedUrl: string      // normalizeUrl(url) — dedup key
  label: string              // defaults to 'General'
  status: OutboxStatus
  attempts: number
  nextAttemptAt: number | null  // epoch ms; null = due now
  lastError: { code: string; message: string } | null
  createdAt: string          // ISO-8601
  updatedAt: string          // ISO-8601
}

export interface PendingCapture {
  id: string
  url: string
  label: string
  status: OutboxStatus
  attempts: number
  lastError: { code: string; message: string } | null
  createdAt: string
}
```

Pending items are **local-only** and never upserted to Supabase. On successful drain the item is removed and a normal server `Link` appears via `links:changed`.

### 3.2 Persistence

- New `src/main/data/outbox-repository.ts` backed by a dedicated electron-store file (no new dependency):
  ```ts
  new Store<OutboxStoreSchema>({
    name: 'outbox',
    defaults: { schemaVersion: 1, items: [] },
    migrations: { /* versioned upgrades */ }
  })
  ```
- A separate file (not the prefs `linkster` store) keeps the outbox independently migratable and avoids rewriting prefs on every enqueue. Upgrades go through **electron-store `migrations`** keyed on the store version.
- Repository API (all synchronous, pure enough to unit-test with an injected store):
  `enqueue`, `list`, `listDue(now)`, `get(id)`, `markAttempt`, `markFailed`, `markSynced` (removes), `remove`, `findByNormalizedUrl`.

### 3.3 Capture pipeline refactor (`src/main/services/capture-service.ts`)

Split the current monolith into three responsibilities so offline enqueue and online drain are independent:

```ts
// validate + server dedup + outbox dedup + enqueue. Never fetches. Never throws on network.
export async function prepareCapture(rawUrl: string, label?: string): Promise<PrepareResult>

// fetch metadata → ensureLabel → createLink → remove from outbox → broadcast. Idempotent.
export async function drainOutbox(): Promise<DrainSummary>

// orchestrator: prepare, then attempt an immediate drain. Preserves today's fast online path.
export async function captureUrl(rawUrl: string): Promise<CaptureResult>
```

`PrepareResult` is discriminated and drives the dedup fix:

```ts
type PrepareResult =
  | { queued: true; item: OutboxItem; alreadyPending: boolean }
  | { accepted: false; retryable: boolean; reason: string } // retryable=false → hard reject (invalid URL)
```

Rules:
- Server dedup (`linkExists` on `normalizedUrl`) runs **before** enqueue; if a server row exists, do not enqueue.
- Outbox dedup: `findByNormalizedUrl` → if present, return `alreadyPending: true` without a second item.
- A network failure during prepare itself must **not** prevent enqueue: enqueue first, then attempt enrichment in the drain. Enqueue is the durability boundary.

### 3.4 Drainer & backoff (`src/main/services/outbox-drainer.ts`)

- Exponential backoff with jitter: `delay = min(MAX, BASE * 2^attempts) * (1 ± JITTER)` with `BASE = 2s`, `MAX = 5min`, `JITTER = 0.2`.
- Max attempts (default 6) → `status: 'failed'`, waiting for manual Retry/Discard. Never auto-deleted.
- Singleton drain loop guarded against concurrent runs (one in-flight drain; enqueue during a drain schedules a follow-up pass).
- Triggers:
  - new enqueue,
  - app start (`app.whenReady` path in `src/main/index.ts`),
  - interval poll (e.g. 30s) while items exist,
  - connectivity recovery via Electron `net.isOnline()` and successful Supabase round-trips,
  - `auth:changed` → `authenticated` (auth recovery re-enables RLS-scoped inserts),
  - realtime reconnect — requires exposing a status callback from `realtime-service` (currently `.subscribe()` has none, `realtime-service.ts:23-35`).
- A sustained-failure cap surfaces a global "sync paused" banner rather than hammering Supabase.

### 3.5 Dedup fix (`src/main/services/clipboard/capture-pipeline.ts`)

- Keep the session hash as a cheap immediate debounce **only**, not as a permanent lockout.
- `onCapture` becomes async and reports an outcome. The pipeline marks `lastHash` sticky only for `{ accepted: true }`; on `{ accepted: false, retryable: true }` it clears `lastHash` so re-copying retries.
- Because `prepareCapture` dedups against the outbox, a failed-but-queued URL still suppresses a duplicate copy (correct) while `AC5` is satisfied: a URL whose capture fully failed (never queued) is re-attemptable.

### 3.6 Conflict-safe reconciliation (`src/shared/lib/link-merge.ts`, pure)

- Renderer tracks locally modified fields per link with a timestamp (`dirtyFields: Map<linkId, { fields: Set<keyof Link>; at: number }>`).
- On `links:changed` / reload, merge server rows with dirty rows instead of blind replacement:
  `mergeLink(local, remote, dirty): { link: Link; conflict: boolean }`
  - if the link is dirty and `local.updatedAt >= remote.updatedAt`, keep the local field values and mark the link for a re-issued write;
  - if both sides changed within a clock-skew window with differing values, keep local and set `conflict: true` → "conflict" badge;
  - otherwise take remote (last-write-wins).
- Merge is a pure function over plain objects so it can be unit-tested without Electron/Supabase.

### 3.7 IPC contract additions (`src/shared/contract/ipc.ts`, `preload/index.ts`, handlers)

```
links:pending-list     → PendingCapture[]              // renderer reads outbox
links:retry-pending    (id?: string)                   // retry one or all failed items
links:discard-pending  (id: string)                    // remove a failed item
links:pending-changed  → push                          // outbox mutated; renderer refetches pending
```

- All request/response channels use `IpcResult<T>`; ids validated as strings; zod-validated payloads where a body is passed.
- New preload methods on `LinksterApi.links`: `pendingList`, `retryPending`, `discardPending`, `onPendingChanged`.
- `links:changed` keeps its current meaning (server state); `links:pending-changed` is separate so a pending-card update does not force a full server reload.

### 3.8 Renderer

- `links-store.ts`: add `pending: PendingCapture[]`, `loadPending()`, `retryPending(id?)`, `discardPending(id)`, and subscribe to `onPendingChanged`.
- `HomeScreen`/grid: prepend pending cards **only in the `all` filter** (no label/date/domain/search applied); failed items render an error affordance with Retry / Discard.
- New `PendingLinkCard` component mirroring `LinkCard` styling (`ui-classes`, `labelColor` for the default label) with a spinner/secondary style.
- Stats stay server-derived; pending items are surfaced as a **separate "N pending" pill** so totals never double-count.

## 4. Acceptance Criteria

| # | Criterion | Verified by |
|---|---|---|
| AC1 | With the network disabled, copying a URL creates a local pending card within ~1s. | Slice 1/2 manual + unit (§5) |
| AC2 | When connectivity returns, pending cards sync automatically and become normal cards with no user action. | Slice 3 drain test |
| AC3 | Restarting with pending items preserves and resumes the outbox. | Slice 1 repository test + e2e |
| AC4 | A permanently failing item is surfaced with visible Retry and Discard; it never disappears silently. | Slice 2 UI + IPC test |
| AC5 | Re-copying a URL whose capture previously failed retries it (no permanent session hash lockout). | Slice 1 pipeline test |
| AC6 | A local read/archive toggle is not lost when a stale remote update arrives. | Slice 4 merge test |

## 5. Tracer Bullet Breakdown

Each slice is a vertical end-to-end cut that is demonstrably working before the next begins.

### Slice 1 — Durable outbox + background drain (headless E2E)
`OutboxRepository` (schema version, `enqueue/list/listDue/markAttempt/markFailed/markSynced/remove/findByNormalizedUrl`); split `capture-service` into `prepareCapture` / `drainOutbox` / `captureUrl`; `clipboard-controller` enqueues instead of swallowing; drain on enqueue, app start, and a 30s interval; pipeline hash is no longer a permanent lockout.
**Done when:** with a mocked/failing Supabase, a copied URL is enqueued, survives a store re-open (simulated restart), and drains on the next trigger — targeted by `tests/unit/outbox-repository.test.ts` and a `prepare`/`drain` test.

### Slice 2 — Pending & failed UI with actions
`links:pending-list`, `links:retry-pending`, `links:discard-pending`, `links:pending-changed`; preload + contract types; `links-store` pending state; `PendingLinkCard` with spinner/error, Retry, Discard; separate pending indicator in stats.
**Done when:** offline copies appear as pending cards immediately; a terminal failure shows Retry/Discard and never vanishes (AC1, AC4).

### Slice 3 — Backoff, recovery triggers, and failure cap
Exponential backoff + jitter with max attempts → `failed`; `net.isOnline` / auth-recovered / realtime-reconnect triggers; realtime status callback; item-level error on failed cards plus a global "sync paused" banner after sustained failures; dedup keyed on persisted state.
**Done when:** reconnect drains without user action; a capped failure shows both the item-level error and the global banner; re-copying a fully-failed URL retries (AC2, AC5).

### Slice 4 — Conflict-safe merge
Pure `link-merge.ts`; renderer dirty-field tracking; merge on `links:changed`/reload; conflict badge; re-issue local edits newer than remote.
**Done when:** a read/archive toggle survives a stale remote update and an ambiguous merge is badged, not discarded (AC6).

## 6. Decisions (confirmed 2026-09-15)

1. **Pending visibility by filter:** `all` filter only. Pending cards are hidden whenever a label/date/domain/search filter is active (they have no server fields to filter on yet).
2. **Stats treatment:** server counts unchanged; a separate **"N pending" pill** represents unsynced items (no double counting).
3. **Terminal-failure UI:** **both** — each failed card shows an item-level error with Retry / Discard, *and* a global "sync paused" banner appears after sustained failures.
4. **Store backend:** dedicated electron-store file (`outbox`) using built-in **`migrations`**; no new dependency.

Remaining execution-time check (not a product decision): ensure `clipboard-controller` and any future quick-capture (Feature 3) route through `prepareCapture`, and no direct `createLink` capture path remains.

## 7. Risks

- Outbox growth is unbounded while offline; add a soft cap + oldest-first backpressure decision.
- `net.isOnline()` is a coarse signal; treat real Supabase failures as the authoritative trigger and use `isOnline` only as an early nudge.
- Clock skew between devices breaks per-field `updated_at` comparisons; keep the merge tolerant and default to keeping local on ambiguity.
- Concurrent capture + drain can double-insert without the server `UNIQUE(user_id, url_normalized)` guard; rely on `isUniqueViolation` (`link-repository.ts:129`) to treat that as success and remove the outbox item.
- Releasing an auth/realtime status callback may touch `realtime-service` and `auth-service` contracts; keep the callback optional to avoid regressions.
