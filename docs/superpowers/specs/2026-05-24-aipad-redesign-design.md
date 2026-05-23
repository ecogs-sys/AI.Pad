# AI.Pad chrome redesign — design spec

**Date:** 2026-05-24
**Status:** approved for planning
**Source of truth for visuals:** `docs/design_handoff_aipad_redesign/design/` (tokens.css, app.jsx, screens.jsx, icons.jsx) and `docs/design_handoff_aipad_redesign/AI.Pad Redesign (standalone).html`
**Scope:** visual parity reskin of the existing renderer chrome. No behavior change. No new surfaces in Phase 1.

---

## Goal

Bring the AI.Pad desktop chrome to visual parity with the Claude-Design handoff in `docs/design_handoff_aipad_redesign/`. The redesign is the dusty-blue / cool-near-black theme with a custom titlebar, status-aware tab strip and sidebar rows, redesigned dialogs, and a status palette of running / awaiting / limited / idle (mapped onto the existing contracts — no new statuses).

Out of scope for Phase 1: the command palette (⌘K), the empty-state screen, the sidebar status-overview header, the app-icon swap, and elevating `rate-limited` to a first-class status. All listed under [Phase 2 — deferred](#phase-2--deferred).

## Non-goals

- No new app behavior. The auto-resume detector, attention awareness, persistence, IPC, keyboard shortcuts, and process model are untouched.
- No framework adoption. The renderer stays vanilla TypeScript + DOM; we do **not** adopt React for this work even though the handoff is JSX.
- No new dependencies for Phase 1 (CSS-only).
- No app-icon regeneration. The OS-level icon set stays as-is.

## Status palette mapping

The handoff defines four status colors. We map them onto today's data model without changing contracts.

| Design status   | Existing source                                  | Color token (in `tokens.css`)       |
|-----------------|--------------------------------------------------|-------------------------------------|
| `running`       | `SessionInfo.status === 'running'`               | `--st-running` (sage green)         |
| `awaiting`      | `SessionInfo.status === 'awaiting-input'`        | `--st-awaiting` (warm amber)        |
| `limited`       | `SessionState.resumeAt != null` (pending resume) | `--st-limited` (soft red)           |
| `idle`          | `SessionInfo.status === 'exited'`                | `--st-idle` (neutral gray)          |

`limited` is a purely visual layer — the chrome already tracks `resumeAt` per session (`apps/desktop/src/renderer/chrome/state.ts`), and the dot/pill driven by it is restyled in Slices 3 and 4. Elevating `limited` to an enum member in `@aipad/contracts` is Phase 2.

The redundant `SessionState.attention` boolean (it duplicates `info.status === 'awaiting-input'`) stays in place for Phase 1 to keep the diff small; cleanup is Phase 2.

## Architecture

**No structural change.** Every existing class (`LayoutManager`, `TabStrip`, `Sidebar`, `showSettingsDialog`, `showNewSessionDialog`, `showRenameDialog`) keeps its current public shape and is reskinned in place. One new module is added — `chrome/titlebar.ts` — following the same class-with-callbacks pattern as `TabStrip` and `Sidebar`.

**Where styles live.** The single inline `<style>` block in `apps/desktop/index.html` (~80 lines) is split into:

- `apps/desktop/src/renderer/chrome/styles/tokens.css` — the design handoff's tokens verbatim (or near-verbatim). Imported once from `chrome/main.ts`.
- `apps/desktop/src/renderer/chrome/styles/chrome.css` — every component-level rule (titlebar, tab, sidebar-row, dialog) using only `var(--*)` tokens, no hard-coded colors.

`apps/desktop/index.html` keeps only structural markup. `apps/desktop/terminal-host.html` is unchanged in Phase 1 (xterm's theme is data, not CSS — see Slice 1.5).

**Titlebar menu items.** The custom titlebar on Windows/Linux re-uses the existing Electron application menu instead of duplicating items. Clicking a top-level menu name (File / Tabs / View / Window / Help) sends a new IPC `ChromeMenuPopup` to main, which calls `Menu.popup()` on the corresponding submenu it already built in `app-menu.ts`. The renderer never knows which items live in each submenu — main does. Existing accelerators keep firing exactly as before.

Two submenus are added to `app-menu.ts` to match the design's five-name bar:
- **Window** — Toggle Fullscreen, Zoom In, Zoom Out, Reload.
- **Help** — Report Issue (opens `https://github.com/ecogs-sys/AI.Pad/issues` via `shell.openExternal`).

**Platform shape of the titlebar.**
- **Windows + Linux:** `frame: false` on the `BrowserWindow`. Custom 32px bar with glyph + five menu items + window controls (min / max / close). The whole bar is `-webkit-app-region: drag`; every interactive element inside is `no-drag`.
- **macOS:** `titleBarStyle: 'hiddenInset'`. Custom 32px bar with glyph (offset ~70px from the left to clear the traffic lights) + centered title. **No menu items, no window controls** — the OS menubar is at the top of the screen and the traffic lights are an OS overlay.

## Slice plan

Each slice lands as one PR. After Slice 5 the chrome matches the handoff within visual-parity scope.

### Slice 1 — Foundation: tokens + style extraction

- Add `apps/desktop/src/renderer/chrome/styles/tokens.css` (verbatim from `docs/design_handoff_aipad_redesign/design/tokens.css`).
- Add `apps/desktop/src/renderer/chrome/styles/chrome.css` — current visual rules rewritten in terms of tokens (the goal is that every color comes from a token).
- Strip the `<style>` block from `apps/desktop/index.html`. Import both stylesheets from `chrome/main.ts`.
- Change `backgroundColor: '#1e1e1e'` on the `BrowserWindow` in `apps/desktop/src/main/index.ts` to `#1c1f25` (hex of `--bg-0`) so the first-paint flash matches the new theme.
- Acceptance: `pnpm dev` looks ~identical to before once the chrome has rendered, but every color comes from a token. The only intentional visible change in this slice is the cold-start paint flash going from warm gray to dark cool-blue.

### Slice 1.5 — Terminal palette sync

- Update the xterm theme in `packages/terminal-host` (the per-session terminal renderer) to numeric/hex values that mirror the new `--term-*` tokens: `term-bg`, `term-fg`, `term-dim`, `term-green`, `term-cyan`, `term-yellow`, `term-blue`, `term-magenta`, `term-red`. xterm.js consumes a theme object, not CSS variables, so this is a JS-side change.
- No new tokens, no new behavior, no DOM change in `terminal-host.html`.
- Acceptance: the terminal area inside a tab visually matches the chrome's new dark cool-blue palette; ANSI colors look correct against the new background.

### Slice 2 — Custom titlebar

- New IPC channel `ChromeMenuPopup` in `@aipad/contracts` (renderer → main) with payload `{ menu: 'File' | 'Tabs' | 'View' | 'Window' | 'Help', x: number, y: number }`.
- Wire `Menu.popup()` for the corresponding submenu in `app-menu.ts`. To make this clean, refactor `buildAppMenu` so each submenu is a named export (or returned in a map keyed by name) — the renderer can request "Tabs" without main parsing strings.
- Add **Window** and **Help** submenus in `app-menu.ts` (see Architecture above).
- New module `apps/desktop/src/renderer/chrome/titlebar.ts` — `TitleBar` class. Constructor `new TitleBar(rootEl, { bridge, platform })`. Renders the platform-correct shape.
- Window options:
  - Windows / Linux: `frame: false`.
  - macOS: `titleBarStyle: 'hiddenInset'`.
- Update `apps/desktop/index.html` to add a `<div id="titlebar">` above `#tab-strip`. Update the grid in `chrome.css` to a three-row layout: `titlebar / tab-strip / body`.
- Update `apps/desktop/src/renderer/chrome/main.ts` to instantiate `TitleBar` alongside `TabStrip` and `Sidebar`.
- Acceptance: window is draggable by the new bar; clicking each menu name pops the matching native submenu in place; on macOS the traffic lights still work and don't overlap the glyph; all keyboard shortcuts still work via the existing app-menu accelerators.

### Slice 3 — Tab strip reskin

- Update `apps/desktop/src/renderer/chrome/tab-strip.ts` to emit the DOM shape from `app.jsx`'s `<Tab>`:
  - Active tab gets a 2px top stripe in `--accent`.
  - Status dot color comes from `info.status` (running → `--st-running`; awaiting-input → `--st-awaiting`; exited → `--st-idle`). When awaiting, the dot gets a soft ring (`box-shadow`).
  - `resumeAt != null` overrides to `--st-limited` styling.
  - `×` close glyph in `--text-4`.
  - 36px tab height; min-width 160px, max-width 220px; right border between tabs.
- Move tab styles out of `index.html` into `chrome.css`.
- Resume badge (today rendered next to the title in amber) is restyled to a small soft-red pill matching the design.
- Acceptance: tabs match the handoff visually; drag-reorder, click-to-focus, close, and keyboard shortcuts unchanged; resume badge still cancellable via the sidebar (cancel control stays on the sidebar row per existing UX).

### Slice 4 — Sidebar rows reskin

- Update `apps/desktop/src/renderer/chrome/sidebar.ts` to emit the DOM shape from `app.jsx`'s `<SessionRow>`:
  - 22px rounded shell-icon tile with a tiny corner status dot (any non-idle status).
  - Title row (session title or shell name) in `--text-1` when active, `--text-2` otherwise.
  - Cwd row in `--text-4` mono.
  - Status pill below (style `'pill'` from `<StatusBadge>`), showing label + elapsed time.
  - Active row: left border in `--accent`, background `--bg-3`.
- Update the sidebar header: uppercase "Sessions" label in `--text-3`, plus a `+` button (already wires to `newTab`). The handoff's ⇅ sort glyph is **not rendered in Phase 1** — it ships with the sort feature in Phase 2.
- Add a sidebar footer: "N active" count on the right. The handoff's "⌘K palette" hint on the left is **not rendered in Phase 1** — it ships with the command palette in Phase 2.
- Collapsed-sidebar mode: only the 22px icon tile of each row is visible; everything else is hidden via the existing `body.sidebar-collapsed` class.
- Resume badge cancel control (`×`) stays on the row and is restyled to live inside the limited-state pill.
- Acceptance: sidebar matches the handoff visually; click-to-focus, right-click context menu, resume cancel, and collapsed mode unchanged.

### Slice 5 — Dialogs reskin

- Reskin `apps/desktop/src/renderer/chrome/settings-dialog.ts` to match `<SettingsModal>` in `screens.jsx`:
  - 560px wide card on `--bg-2` with `--border-2` and soft drop-shadow.
  - Section header with uppercase "Settings · Auto-resume" label.
  - First section: a real toggle control (not a checkbox) for `autoResume.enabled`, with explanatory copy to the right of it.
  - "Text to detect" section with focus ring in `--accent-soft` when the input is focused; small example chips below the input.
  - "Response to send" section.
  - Footer row with Cancel (secondary) and Save (accent) buttons.
- Reskin `apps/desktop/src/renderer/chrome/new-session-dialog.ts` (both the New-Tab dialog and the Rename dialog) to use the same card surface tokens, button styles, and label conventions — visual consistency rather than copying the SettingsModal layout.
- The `#dialog-mount` overlay scrim uses `--bg-overlay` (oklch with alpha) and `backdrop-filter: blur(2px)` per the design.
- Acceptance: open Settings (Ctrl+,) and open New Tab (Ctrl+T) — both dialogs match the handoff visually; submit/cancel/escape behavior unchanged; the rate-limit detection phrase still saves and triggers correctly.

## File inventory

### Added (3 files)
- `apps/desktop/src/renderer/chrome/styles/tokens.css`
- `apps/desktop/src/renderer/chrome/styles/chrome.css`
- `apps/desktop/src/renderer/chrome/titlebar.ts`

### Modified
- `apps/desktop/index.html` — strip inline `<style>`, add `#titlebar` div, import stylesheets via the main entry.
- `apps/desktop/src/main/index.ts` — `BrowserWindow` options: `frame: false` on win/linux, `titleBarStyle: 'hiddenInset'` on darwin; `backgroundColor` → `#1c1f25`.
- `apps/desktop/src/main/app-menu.ts` — add Window and Help submenus; export the per-submenu map (or expose `popupSubmenu(name)`) so renderer's `ChromeMenuPopup` IPC handler can pop them.
- `apps/desktop/src/renderer/chrome/main.ts` — instantiate `TitleBar`; import stylesheets.
- `apps/desktop/src/renderer/chrome/tab-strip.ts` — new DOM shape (Slice 3).
- `apps/desktop/src/renderer/chrome/sidebar.ts` — new DOM shape (Slice 4).
- `apps/desktop/src/renderer/chrome/settings-dialog.ts` — new layout (Slice 5).
- `apps/desktop/src/renderer/chrome/new-session-dialog.ts` — new layout (Slice 5).
- `packages/contracts/src/ipc.ts` — add `ChromeMenuPopup` channel (Slice 2). Also add Zod schema for payload.
- `packages/terminal-host/**` — xterm theme update to numeric values mirroring the new `--term-*` tokens (Slice 1.5).

### Untouched
- `packages/core/**` — no behavior changes.
- `packages/keymap/**` — bindings unchanged.
- `apps/desktop/src/main/view-manager.ts`, `notification-bridge.ts`, `session-bootstrap.ts`, `auto-update.ts` — unchanged.
- Existing tests, except where a class string they assert on is renamed (update the test alongside the rename).

### Deleted
- The inline `<style>` block in `apps/desktop/index.html` — moves into `tokens.css` + `chrome.css`.

## Tests & verification

**Each slice must pass:** `pnpm typecheck`, `pnpm lint`, `pnpm test`. The renderer-chrome unit tests are light (mostly DOM-shape checks); where Slice 3 or 4 renames a class string, the test gets updated in the same PR.

**`pnpm test:e2e` (Playwright) is the highest-risk gate for Slice 2** — the frameless window changes window outer dimensions and removes the OS title from queries. If e2e selectors break, update the selectors (not the production strings).

**Manual smoke after each slice (`pnpm dev`):**
- Open four tabs: pwsh + claude + codex + a script that emits `BEL`.
- Trigger an attention event (BEL or idle-after-prompt in a background tab) — confirm tab dot + sidebar pill + native notification.
- Enable auto-resume in Settings; trigger a fake limit phrase — confirm resume badge appears, then fires.
- Toggle the sidebar (Ctrl+B), open Settings (Ctrl+,), open New Tab (Ctrl+T), reorder tabs by drag.
- Compare against `docs/design_handoff_aipad_redesign/AI.Pad Redesign (standalone).html` opened in a browser.

**Don't-break list (regression risks):**
- All `Ctrl+` shortcuts: `T / W / Tab / Shift+Tab / 1–9 / B / \ / Shift+\ / Shift+W / ,`.
- Drag-to-reorder tabs.
- Sidebar context menu (right-click).
- Settings persistence across restart.
- Auto-resume firing and the cancel `×` on the badge.
- Per-tab crash isolation (Slice 2's `BrowserWindow` change must not regress process spawning).

## Phase 2 — deferred

Each item below is intentionally out of scope for this redesign and is planned as a follow-up brainstorm → spec → plan cycle.

- **Command palette (⌘K)** — port `CommandPalette` from `screens.jsx`. Switch sessions, start sessions, run actions; the design footer hint already points at it.
- **Empty-state screen** — port `EmptyState` from `screens.jsx`; shown in `#view-host` when zero tabs exist (today the app always boots at least one tab; the empty state would appear after a user closes the last tab).
- **Sidebar status-overview header** — port `StatusOverview` from `app.jsx`; the 4-cell awaiting/limited/running/idle counts that sit above the session list.
- **App-icon swap** — pick one of the three directions in `docs/design_handoff_aipad_redesign/design/icons.jsx`, generate the multi-resolution `.ico` / `.icns` / png set, replace `apps/desktop/build/icon.png` and wire into `electron-builder`.
- **Elevate `rate-limited` to a first-class `SessionStatus`** — add the enum member in `@aipad/contracts`, set it from the SessionManager when `resumeScheduled` fires, drive the visual layer off `status` instead of `resumeAt`.
- **Remove the redundant `SessionState.attention` boolean** — it duplicates `info.status === 'awaiting-input'`. Small cleanup, separable PR.

## Risks & open questions

**Resolved during brainstorm:**
- Stack: vanilla TS/DOM (not React).
- Scope: visual parity only; new surfaces deferred to Phase 2.
- Titlebar shape: custom on Windows/Linux, native (`hiddenInset`) on macOS.
- App icon: deferred.
- Window + Help submenus: added in `app-menu.ts` (Q1).
- Redundant `attention` boolean: kept, cleaned in Phase 2 (Q2).
- Terminal palette sync: included as Slice 1.5 (Q3).

**Remaining risks (managed inside the slices):**
- macOS traffic-light overlap with the in-window glyph — handled by a 70px left inset on darwin.
- Frameless drag regions — verified per slice by manually dragging the window.
- Playwright e2e selector drift after Slice 2 — verified by running `pnpm test:e2e` as part of that slice's acceptance.

## References

- Handoff: `docs/design_handoff_aipad_redesign/design/` and `AI.Pad Redesign (standalone).html`.
- Existing renderer chrome: `apps/desktop/src/renderer/chrome/`.
- Existing main process: `apps/desktop/src/main/`.
- Contracts: `packages/contracts/src/`.
