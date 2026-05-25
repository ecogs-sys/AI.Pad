# AI.Pad — vanilla TS/DOM port

Plain-JavaScript / DOM port of the JSX prototype. **No React, no JSX, no build step required to run the demo.** All components are pure functions that return an `HTMLElement`.

## Quick start

Just open **`demo.html`** in any modern browser — it loads Babel-standalone, transforms the TS at runtime, and renders all seven screens stacked vertically so you can scroll through them.

In production, run `tsc` on the `.ts` files and load the compiled `.js` directly (skip Babel). The demo wires Babel only so the file is double-clickable with no install.

## File layout

```
vanilla-ts/
├── demo.html         ← open this. self-contained runnable preview.
├── bundle.ts         ← GENERATED — concatenation of the modules below
│                       used only by demo.html. Don't edit; edit the
│                       individual modules and regenerate.
├── components.css    ← all structural styles (BEM-ish classes)
│
├── types.ts          ← Session, Status, BadgeStyle, STATUSES, sortSessions
├── platform.ts       ← MOD, kbd(), matchShortcut() — cross-platform
├── dom.ts            ← h(), s() (SVG), setChildren(), setClass()
├── icons.ts          ← appGlyph(), iconA/B/C(), winCtrlGlyph()
├── status-badge.ts   ← renderStatusBadge({ status, time, style })
├── chrome.ts         ← renderTitleBar(), renderTabBar(), renderSidebar()
├── terminal.ts       ← renderTerminalPane() + Line union (no data here)
├── panels.ts         ← settings modal, command palette, empty state,
│                       markdown preview pane, new session dialog, scrim
└── mocks.ts          ← all sample data — sessions, tabs, terminal
                        line samples, recent dirs, md files
```

## Pattern: render-once + update-in-place

Most renderers in here are pure: `function renderX(opts): HTMLElement`. The shape mirrors the JSX components 1:1 so adapting between the two is mechanical.

For high-frequency updates (status badges ticking each second, terminal lines streaming in), don't blow away the whole tree — there are dedicated update functions like `updateSessionRow(row, session, opts)` in `chrome.ts` that mutate in place. Use that pattern wherever a sub-section changes frequently.

## Cross-platform shortcuts

⚠ **Don't hardcode `⌘`.** Use the `platform.ts` helpers everywhere shortcuts appear in the UI or are handled.

```ts
import { kbd, matchShortcut } from './platform.ts';

// Display:
kbd('Mod+K')          // → '⌘K'    on macOS · 'Ctrl+K'        on Win/Linux
kbd('Mod+Shift+P')    // → '⌘⇧P'   on macOS · 'Ctrl+Shift+P'  on Win/Linux
kbd('Mod+Enter')      // → '⌘↵'    on macOS · 'Ctrl+Enter'    on Win/Linux

// Event matching:
window.addEventListener('keydown', (e) => {
  if (matchShortcut(e, 'Mod+K')) openPalette();
  if (matchShortcut(e, 'Mod+,')) openSettings();
});
```

The `Mod` token maps to **Cmd on macOS** and **Ctrl on Windows/Linux**. Other tokens supported: `Shift`, `Alt`/`Option`, `Ctrl` (literal control, rarely needed alongside `Mod`), `Enter`, `Esc`. On macOS the joiner (`+`) is dropped because that's the platform convention (`⌘⇧P`, not `⌘+⇧+P`). Win/Linux keeps the joiners.

For the Electron main-process accelerator strings, use `CommandOrControl+K` — Electron auto-translates it. The display formatting is purely a renderer concern.

## What to copy into AI.Pad

1. **`tokens.css`** (in the sibling `design/` folder) — drop into your renderer's global stylesheet verbatim.
2. **`components.css`** — drop in alongside. All class names are prefixed `aip-` so they won't collide.
3. **The TS modules** — read, adapt, and integrate. Don't blindly copy `dom.ts` if your codebase already has a DOM helper or a templating layer — replace the calls but keep the structure.

## What NOT to copy

- `bundle.ts` — generated, demo-only.
- `demo.html` — visual reference only; the screen factories at the bottom are mock data wiring you'll replace with real session state.
- Sample terminal content (`TERM_DEFAULT`, `TERM_AWAITING`, etc. in `terminal.ts`) — those are illustrations of the line model; real lines come from the PTY stream.

## Compile to JS for production

```bash
# from this folder
tsc --target es2020 --module esnext --moduleResolution bundler --strict *.ts
# or, for a single bundle:
esbuild *.ts --bundle --format=esm --outfile=dist/components.js
```

Both produce regular `.js` you can ship in the Electron renderer. The TS surface is intentionally small and free of fancy types — nothing TypeScript-specific that won't compile cleanly under `strict`.
