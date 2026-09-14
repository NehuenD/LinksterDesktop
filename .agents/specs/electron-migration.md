# Spec: Linkster → Electron Migration

> **Status:** Draft — pending user review
> **Source of truth:** `APP_AUDIT.md` (§2 features, §6 models, §7.3 backend contract, §15.2 local keys, §19.1 behavioral contract) + grilling decisions (2026-09-14)
> **Target repo:** NEW repository (this Flutter repo is frozen as reference)
> **Language/format:** English / Markdown

---

## 1. Goal & Rationale

Replace the Flutter desktop app with an **Electron + React + TypeScript** application to gain HTML/CSS/JS flexibility (UI control, ecosystem, hiring), while delivering **genuine Windows, Linux, and (best-effort) macOS** support. The rewrite targets the app's **behavioral contract**, not its code structure: dead code is dropped, all audited defects (D1–D17) are fixed, and Supabase remains the backend.

**Definition of success:** a fresh install reproduces every user-visible behavior in `APP_AUDIT.md` §19.1, on all three desktop OSes, with no Windows-only assumptions, backed by a hardened Supabase schema.

## 2. Scope

**In scope**
- Clipboard auto-capture (`clipboard://` native listener + polling fallback)
- Link library: list, label/status filters, debounced full-text search, advanced filters, Ctrl/Cmd+K palette, pagination/infinite scroll, bulk actions, undo
- Link CRUD: manual add, open, edit, refresh metadata, read/archive toggles, delete
- Labels: seed, create, assign, create-and-assign, reset, rename, merge, delete, `General` protection
- Screenshots: cross-platform folder watcher, thumbnails, reveal/copy-path/delete, notify
- Auth: Google OAuth (PKCE) via `linkster://` deep link, session in OS keychain, sign-out UI
- Settings: theme, monitoring toggle, screenshot folder, label management, export JSON/CSV, copy-all, version
- Desktop shell: tray, minimize-to-tray, frameless (Win/Linux) + native (macOS), single-instance, native notifications, auto-update
- Supabase Realtime sync (last-write-wins)
- Packaging for Windows (NSIS), macOS (DMG), Linux (AppImage + deb)

**Out of scope**
- Mobile apps (backend kept mobile-ready; `MOBILE_REQUIREMENTS.md` retained)
- Code signing / notarization (unsigned builds; document warnings)
- Old local `SharedPreferences` data import (fresh install)
- Browser extension, in-app browser, collaboration/sharing

## 3. Architectural Seams

### 3.1 Process model
```
Renderer (React/TS, contextIsolation:on, sandbox, no node)
   │  typed IPC (preload bridge) — invoke/on only via allowlisted channels
   ▼
Main process (Node/TS)
   ├─ data/       LinkRepository, LabelRepository, AuthService, RealtimeService  → Supabase
   ├─ services/   ClipboardService, MetadataService, ScreenshotService,
   │              TrayService, WindowService, NotificationService, ExportService
   ├─ store/      electron-store (prefs + link cache), safeStorage (session)
   └─ ipc/        channel handlers + zod-validated payloads
```

### 3.2 IPC contract (renderer ↔ main)
- Namespaced channels: `links:*`, `labels:*`, `auth:*`, `settings:*`, `screenshots:*`, `system:*`
- Every request returns a discriminated result `{ ok: true, data } | { ok: false, error: AppError }`
- Long-lived push events (`links:changed`, `auth:changed`, `screenshots:new`) via `webContents.send`
- Payloads validated with **zod**; all TS types generated from a single shared `contract` module

### 3.3 Data contracts (unchanged wire shape)
`Link` (11 fields, snake_case keys, ISO-8601 dates) and `Screenshot` (local-only) keep the exact shapes from `APP_AUDIT.md` §6 so Supabase rows and any cached JSON remain compatible. Labels stay a raw `String` with `General` as the coalescing default.

### 3.4 Backend
- Keep Supabase (PostgREST + Auth + Realtime). Apply the **hardening migration**: `UNIQUE(user_id, url)`, `NOT NULL` + `ON DELETE CASCADE` on `user_id`, `is_read`/`is_archived` indexes, consistent UUID default.
- URL normalization before uniqueness: lowercase host, strip fragment + `utm_*`/`fbclid`, trim trailing slash.

## 4. Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | App launches on Windows, Linux, macOS; a second launch focuses the existing instance instead of starting a new one. |
| AC2 | Copying a URL anywhere is captured within ~1s, metadata-enriched, deduped (normalized), saved under `General`, and appears live without manual refresh. |
| AC3 | Library lists newest-first with All/Unread/Archived + per-label counts matching server data; search is debounced and does not lose active filters on mutation. |
| AC4 | Full label lifecycle works, `General` is protected (case-insensitive), lazy seeding creates `General` + `News`. |
| AC5 | Every §19.1 feature is present: sign-out UI, manual add, visible error surface, bulk actions, pagination, shortcuts, undo, advanced filters, Ctrl/Cmd+K. |
| AC6 | Screenshots are detected from the OS default folder (per platform, with override), thumbnailed, and reveal/copy/delete work. |
| AC7 | Google sign-in completes via `linkster://`, auto-login persists across restarts, tokens live in OS keychain, sign-out clears local caches. |
| AC8 | Closing the window keeps capture alive in the tray; Quit works from tray; notifications fire when enabled. |
| AC9 | Changes on another device appear via Realtime; conflicting edits resolve last-write-wins. |
| AC10 | Installers build for all three OSes; unsigned-build warnings are documented. |

## 5. Tracer Bullet Breakdown

Each slice is an end-to-end vertical cut that is demonstrably working before the next begins.

### Slice 0 — Walking skeleton
Electron + Vite + React/TS boots; single-instance lock; main window; preload bridge with one ping channel; electron-store wired; electron-builder emits a Windows build.
**Done when:** `npm run dev` shows the React shell; second instance focuses the first; `npm run build` produces an installer.

### Slice 1 — Auth gate E2E
Main-process Supabase client; Google OAuth PKCE; `linkster://` registration + callback handling; session in `safeStorage`; login screen, sign-out/account UI; auth-state push to renderer.
**Done when:** sign in via browser → app shows Home; restart auto-logins; sign-out clears state.

### Slice 2 — Read path + shell theme
`links:list/count`, `labels:list`, `search` over IPC; React grid (Tailwind + shadcn), sidebar with counts; theme persisted in electron-store; design tokens/glassmorphism + bundled fonts.
**Done when:** real Supabase rows render, filters switch, theme survives restart.

### Slice 3 — Manual CRUD + metadata
Manual Add-URL dialog; edit (url/title/desc/label) with validation; delete with confirm; refresh metadata; main-process HTTP + OG parser with relative-URL resolution and correct Twitter `name` tags.
**Done when:** a link can be added, edited, re-unfurled, and deleted without clipboard involvement.

### Slice 4 — Clipboard capture E2E
Native clipboard listener addon (polling fallback behind same interface); URL validator with the blocklist gaps fixed; session + DB dedup; `_ensureLabelExists('General')`; save + live list update + notification.
**Done when:** copying a URL produces a saved, enriched card within ~1s.

### Slice 5 — Labels management
Create/assign/create-and-assign/reset; rename (reassign links); merge; delete (reset to `General`); seeding + `General` protection — single shared implementation used by both sidebar and settings.
**Done when:** every label operation has one code path and matches §19.1.

### Slice 6 — Search, filters, palette, scale
Debounced search fixing D11; advanced filters (date/label/status/domain); Ctrl/Cmd+K command palette; pagination/infinite scroll; bulk multi-select actions; keyboard shortcuts + undo.
**Done when:** D2 (search/mutation divergence) cannot occur; large libraries page smoothly.

### Slice 7 — Settings, export, error surface
Clipboard toggle, screenshot folder, notification toggles (now functional), theme, label management entry, export JSON/CSV, copy-all, version; global error surface + banners replacing silent failures (D5).
**Done when:** every setting persists and is consumed; errors are visible and recoverable.

### Slice 8 — Screenshots subsystem
Per-OS screenshot folder detection + manual override; file watcher; thumbnail generation; newest-first grid; reveal/copy-path/delete; new-screenshot notification with View jump.
**Done when:** a new screenshot on each OS appears in the app within a few seconds.

### Slice 9 — Desktop shell polish
Tray show/quit; minimize-to-tray on close; frameless custom titlebar on Win/Linux with native macOS chrome; hide-from-taskbar when tray ready; native notifications.
**Done when:** AC8 passes on all three OSes (with documented Linux tray dependency handling).

### Slice 10 — Realtime sync
Subscribe to links/labels changes; reconcile into renderer store; last-write-wins on conflict; reconnection handling.
**Done when:** an edit on device A appears on device B without manual refresh.

### Slice 11 — Packaging & CI
electron-builder targets (NSIS, DMG, AppImage + deb), `electron-updater`, GitHub Actions matrix (win/mac/linux) running Vitest + Playwright + builds; unsigned-build documentation.
**Done when:** all three artifacts build from CI on a tagged release.

### Slice 12 — Parity hardening & acceptance
Verify each of D1–D17 is fixed; map §19.1 items to Playwright tests; run the AC table end-to-end; bundle real fonts.
**Done when:** AC1–AC10 all pass and the audit's §19.1 contract is fully covered.

## 6. Open Items (confirm during execution)

1. Bundle `Outfit` + `Plus Jakarta Sans` vs system fallback.
2. Clipboard addon: ship prebuilt binaries per OS/arch vs compile per-OS in CI; fallback policy if unavailable.
3. Thumbnail engine: `sharp` vs Electron `nativeImage`.
4. Undo history depth/scope.
5. Linux tray: `libayatana-appindicator` detection + graceful degradation.
6. Unsigned macOS: ad-hoc build + documented Gatekeeper bypass is acceptable.

## 7. Risks

- Native clipboard addon adds per-OS build/CI complexity and supply-chain surface.
- Linux tray/notification behavior varies by desktop environment (GNOME vs KDE).
- Unsigned macOS builds trigger Gatekeeper; Windows triggers SmartScreen.
- Realtime + last-write-wins can discard edits made offline for a long time.
- Rewrite scope is large; tracer bullets must stay shippable to avoid a long dead period.
