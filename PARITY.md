# Linkster (Electron) — Parity & Acceptance Record

Source spec: `APP_AUDIT.md` §19.1 (behavioral contract). This records the
acceptance state for the Electron rewrite.

## Defect register (D1–D17)

| # | Defect | Disposition |
|---|---|---|
| D1 | Adaptive polling never re-arms | **Fixed** — native event listener on Windows/macOS; fixed-interval polling fallback only (no dead adaptive path). |
| D2 | Search/mutation list divergence | **Fixed** — every mutation reloads the server; search is server-side. |
| D3 | Ineffective local restore | **Removed** — Supabase is the single source of truth; no local link cache. |
| D4 | Monitoring state not emitted | **Fixed** — `clipboard:get-status` + store; toggle reflects real state. |
| D5 | Errors never surfaced | **Fixed** — global toast + list banner + React error boundary. |
| D6 | Single-instance focus title mismatch | **Fixed** — `requestSingleInstanceLock` + `showMainWindow()`. |
| D7 | Notifications dead on Windows | **Fixed** — Electron `Notification`; settings toggles consumed. |
| D8 | Log viewer wrong dir | **Removed** — log viewer dead code not ported. |
| D9 | Twitter tags read via `property` | **Fixed** — parser reads both `name` and `property`. |
| D10 | Relative OG images not resolved | **Fixed** — `resolveUrl` against final URL. |
| D11 | Search per keystroke | **Fixed** — 300 ms debounce. |
| D12 | One bad row fails a page | **Fixed** — `mapLinkRows` skips malformed rows. |
| D13 | Inconsistent label rename | **Fixed** — one shared label implementation; rename reloads. |
| D14 | Narrow viewport hides Settings/labels | **Fixed** — sidebar always exposes filters, labels, settings, theme. |
| D15 | Broken MSIX CI step | **Removed** — replaced by a 3-OS matrix. |
| D16 | `createLabel` throws uncaught | **Fixed** — validated in the IPC handler and returned as a failure result. |
| D17 | Archived filter overlaps unread | **Fixed** — Unread excludes archived; archived counters include read items. |

## Acceptance criteria (AC1–AC10)

| # | Criterion | Status |
|---|---|---|
| AC1 | Launches on Win/Linux/macOS; second launch focuses existing | Implemented (Windows verified; macOS/Linux via CI) |
| AC2 | Clipboard URL captured, enriched, deduped, saved, live-updated | Verified (native addon smoke test on Windows) |
| AC3 | Newest-first list, filters + label counts, debounced search | Implemented |
| AC4 | Full label lifecycle, `General` protected, lazy seeding | Implemented |
| AC5 | Sign-out, manual add, error surface, bulk, pagination, shortcuts, undo, filters, Ctrl/Cmd+K | Implemented |
| AC6 | Screenshots detected, thumbnailed, reveal/copy/delete | Implemented |
| AC7 | Google OAuth via `linkster://`, auto-login, keychain session, sign-out | Implemented (requires Supabase redirect + manual verify) |
| AC8 | Close keeps capture alive; tray Quit; notifications | Implemented |
| AC9 | Realtime cross-device sync, last-write-wins | Implemented (requires `0002_realtime.sql`) |
| AC10 | Installers for all three OSes; unsigned warnings documented | Windows verified; macOS/Linux via CI |

## Manual prerequisites

1. Supabase Auth → Redirect URLs: add `linkster://auth/callback`.
2. Apply `supabase/migrations/0001_hardening.sql` and `0002_realtime.sql`.
3. Run `npm run native:build` before packaging; CI does this per OS.
4. Optional auto-update: set `LINKSTER_UPDATE_URL` to a generic update feed.

## Known limitations

- Linux/macOS native behavior (tray, addon, packaging) is authored but not yet
  exercised locally; the CI matrix is the verification path.
- Linux clipboard uses the polling fallback by design (no portable global
  clipboard event).
- Builds are unsigned: macOS Gatekeeper and Windows SmartScreen will warn.
- Test coverage targets pure logic and the login gate; desktop shell and
  network flows rely on manual/CI verification.
