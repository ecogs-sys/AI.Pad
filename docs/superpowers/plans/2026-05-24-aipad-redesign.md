# AI.Pad Chrome Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the AI.Pad renderer chrome to match the design handoff in `docs/design_handoff_aipad_redesign/`. Visual parity only — no behavior change.

**Architecture:** Vanilla TypeScript + DOM (no React adoption). Design tokens live in `apps/desktop/src/renderer/chrome/styles/tokens.css`; component rules in `chrome.css`. A new `TitleBar` module renders the custom 32px titlebar (frameless on Windows/Linux; macOS uses `titleBarStyle: 'hiddenInset'` with no in-window menu items). One new IPC channel `ChromeMenuPopup` lets the titlebar pop the *existing* native submenus from `app-menu.ts` — zero menu-item duplication.

**Tech Stack:** TypeScript, Electron 28+, vanilla DOM, electron-vite, xterm.js (terminal palette only), Zod (IPC payload schemas), Vitest (unit tests), Playwright (e2e), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-05-24-aipad-redesign-design.md` (commit 98540b3).

**Slice plan (6 slices, one PR each):**

1. **Slice 1** — Foundation: extract styles, import tokens.css + chrome.css, fix `backgroundColor`.
2. **Slice 1.5** — Terminal palette sync: update xterm theme in `packages/terminal-host` to mirror `--term-*` tokens.
3. **Slice 2** — Custom titlebar: new `TitleBar` module, frameless window on Win/Linux, `hiddenInset` on macOS, `ChromeMenuPopup` IPC, Window + Help submenus in `app-menu.ts`.
4. **Slice 3** — Tab strip reskin.
5. **Slice 4** — Sidebar rows reskin.
6. **Slice 5** — Dialogs reskin (settings + new-session + rename).

After Slice 5 the chrome matches the handoff within visual-parity scope. Phase 2 items (command palette, empty state, status-overview header, app icon swap, `rate-limited` as a first-class status, removing the redundant `attention` boolean) are out of scope for this plan.

---

## Slice 1 — Foundation: tokens + style extraction

**Outcome:** All renderer-chrome styles live in two new CSS files imported from `chrome/main.ts`. The big inline `<style>` block in `apps/desktop/index.html` is gone. Every visible color comes from a token. The cold-start paint flash is dark cool-blue. App still looks ~identical post-mount.

### Task 1.1: Add tokens.css

**Files:**
- Create: `apps/desktop/src/renderer/chrome/styles/tokens.css`

- [ ] **Step 1: Create `apps/desktop/src/renderer/chrome/styles/tokens.css`**

Copy the file verbatim from `docs/design_handoff_aipad_redesign/design/tokens.css`. Paste the full contents — the file is 91 lines and exports `--bg-0..4`, `--bg-overlay`, `--text-1..4`, `--border-1..2`, `--accent` + `--accent-soft` + `--accent-glow`, the four `--st-*` status palettes (running, awaiting, limited, idle) including their `-bg` and `-ring` variants, the `--term-*` ANSI palette, `--titlebar-h`, `--tabbar-h`, `--sidebar-w`, plus the `@keyframes aip-blink` + `aip-pulse` rules and the `.aip-titlebar` Electron drag-region helpers.

The verbatim file you should paste is at `docs/design_handoff_aipad_redesign/design/tokens.css` in the repo.

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/chrome/styles/tokens.css
git commit -m "feat(chrome): add design tokens (tokens.css)"
```

### Task 1.2: Add chrome.css with current rules rewritten in token terms

This task moves the existing inline rules from `index.html` into `chrome.css`, line-for-line, but every color, border, font, and size is replaced with a `var(--*)` token (or sized constant). It is a *visual parity* refactor — the rendered app must look the same after this task as before.

**Files:**
- Create: `apps/desktop/src/renderer/chrome/styles/chrome.css`

- [ ] **Step 1: Write `chrome.css` with all current rules in token form**

Create `apps/desktop/src/renderer/chrome/styles/chrome.css` with this content (the file is structured to mirror the current inline style block in `index.html`; **every** numeric color value below is intentional and derived from the current value or the closest token):

```css
/* ── Base layout ─────────────────────────────────────────────────────────── */
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  background: var(--bg-0);
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: 12px;
  overflow: hidden;
  user-select: none;
}

#chrome-root {
  display: grid;
  grid-template-rows: var(--tabbar-h) 1fr;
  height: 100%;
}

/* ── Tab strip ───────────────────────────────────────────────────────────── */
#tab-strip {
  display: flex;
  align-items: stretch;
  background: var(--bg-1);
  border-bottom: 1px solid var(--border-1);
  padding: 0 4px;
  gap: 2px;
  overflow: hidden;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  background: var(--bg-2);
  color: var(--text-3);
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
  cursor: pointer;
  max-width: 240px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tab.active     { background: var(--bg-0); color: var(--text-1); }
.tab .dot       { width: 7px; height: 7px; border-radius: 50%; background: transparent; flex-shrink: 0; }
.tab .dot.running   { background: var(--st-running); }
.tab .dot.attention { background: var(--st-awaiting); box-shadow: 0 0 0 3px var(--st-awaiting-ring); }
.tab .dot.exited    { background: var(--st-idle); }
.tab .close { color: var(--text-3); margin-left: auto; padding: 0 4px; }
.tab .close:hover { color: var(--text-1); }
.tab .title { overflow: hidden; text-overflow: ellipsis; }
.tab .resume-badge { color: var(--st-awaiting); font-size: 10px; margin-left: 4px; white-space: nowrap; }

.sidebar-row .resume-badge { display: inline-flex; align-items: center; gap: 3px; color: var(--st-awaiting); font-size: 10px; margin-left: 6px; }
.sidebar-row .resume-cancel { color: var(--text-3); cursor: pointer; padding: 0 2px; }
.sidebar-row .resume-cancel:hover { color: var(--text-1); }

#new-tab { padding: 0 12px; background: transparent; color: var(--text-3); cursor: pointer; border: none; font-size: 16px; }
#new-tab:hover { color: var(--text-1); }

/* ── Body + sidebar ──────────────────────────────────────────────────────── */
#body {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  height: 100%;
  min-height: 0;
}
#body.sidebar-collapsed { grid-template-columns: 36px 1fr; }

#sidebar {
  background: var(--bg-1);
  border-right: 1px solid var(--border-1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

#sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  color: var(--text-3);
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
#sidebar-toggle { background: transparent; border: none; color: var(--text-3); cursor: pointer; padding: 2px 6px; }
#sidebar-toggle:hover { color: var(--text-1); }
#sidebar-list { flex: 1; overflow-y: auto; padding: 4px; }

.sidebar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-3);
}
.sidebar-row:hover  { background: var(--bg-2); }
.sidebar-row.active { background: var(--bg-3); color: var(--text-1); }
.sidebar-row.attention { background: var(--st-awaiting-bg); color: var(--text-1); }
.sidebar-row .meta { display: block; font-size: 10px; color: var(--text-3); margin-top: 2px; }

#view-host   { position: relative; min-width: 0; min-height: 0; }
#view-anchor { position: absolute; inset: 0; }

body.sidebar-collapsed .sidebar-row .title-text,
body.sidebar-collapsed .sidebar-row .meta,
body.sidebar-collapsed .sidebar-row .resume-badge,
body.sidebar-collapsed #sidebar-label { display: none; }

/* ── Dialogs ─────────────────────────────────────────────────────────────── */
#dialog-mount {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background: var(--bg-overlay);
  z-index: 100;
}
#dialog-mount.open { display: flex; }

.dialog {
  background: var(--bg-1);
  padding: 18px 22px;
  border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  min-width: 360px;
  font-size: 12px;
}
.dialog h2 { margin: 0 0 14px; font-size: 14px; font-weight: 600; }
.dialog label { display: block; margin: 10px 0 4px; color: var(--text-3); }
.dialog select, .dialog input {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-0);
  color: var(--text-1);
  border: 1px solid var(--border-1);
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
  box-sizing: border-box;
}
.dialog .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
.dialog button {
  padding: 6px 14px;
  background: var(--bg-2);
  color: var(--text-1);
  border: 1px solid var(--border-1);
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}
.dialog button.primary { background: var(--accent); border-color: var(--accent); color: #0d1117; }
.dialog button:hover         { background: var(--bg-3); }
.dialog button.primary:hover { background: #6a96cd; }
.dialog input[type=checkbox] { width: auto; margin-right: 6px; vertical-align: middle; }
.dialog label.checkbox-row   { display: flex; align-items: center; color: var(--text-1); margin: 10px 0 4px; }
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/chrome/styles/chrome.css
git commit -m "feat(chrome): add chrome.css (current rules in token form)"
```

### Task 1.3: Wire stylesheets into chrome entry; remove inline styles; fix `backgroundColor`

**Files:**
- Modify: `apps/desktop/index.html` (strip `<style>` block, keep markup)
- Modify: `apps/desktop/src/renderer/chrome/main.ts` (top of file)
- Modify: `apps/desktop/src/main/index.ts` (line 279)

- [ ] **Step 1: Edit `apps/desktop/index.html` — strip the inline `<style>` block**

Replace the entire `<style>...</style>` element in `apps/desktop/index.html` with nothing (just delete it). The `<head>` should keep `<meta charset>` and `<title>` only. The `<body>` and everything in it stays as-is. The final `<head>` looks like:

```html
<head>
  <meta charset="utf-8" />
  <title>AI.Pad</title>
</head>
```

- [ ] **Step 2: Import the two new stylesheets at the top of `apps/desktop/src/renderer/chrome/main.ts`**

Add these two lines as the FIRST lines in the file (before any other imports):

```ts
import './styles/tokens.css';
import './styles/chrome.css';
```

electron-vite's renderer build supports CSS imports — no extra config needed.

- [ ] **Step 3: Update the `BrowserWindow` cold-start background color**

In `apps/desktop/src/main/index.ts`, find the `new BrowserWindow({` call near line 276. Change:

```ts
backgroundColor: '#1e1e1e',
```

to:

```ts
backgroundColor: '#1c1f25',
```

(The hex equivalent of `--bg-0`. We hard-code it because main-process JS cannot read CSS variables.)

- [ ] **Step 4: Build and run the dev app**

Run from the repo root:

```bash
pnpm typecheck
pnpm lint
```

Both should exit 0.

- [ ] **Step 5: Manual smoke**

```bash
pnpm dev
```

Expected:
- App launches.
- The cold-start window-flash before content paints is a dark cool-blue (not warm gray).
- After mount, the renderer chrome looks ~identical to before this slice.
- Tabs, sidebar, dialogs all render. Open Settings (Ctrl+,) and New Tab (Ctrl+T) — both still work.

Close the app once verified.

- [ ] **Step 6: Run the e2e smoke test**

```bash
pnpm test:e2e -- smoke.spec.ts
```

Expected: PASS. The test asserts `#tab-strip` and `#sidebar` are visible — both still exist. No console errors.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/index.html apps/desktop/src/renderer/chrome/main.ts apps/desktop/src/main/index.ts
git commit -m "refactor(chrome): extract styles into tokens.css + chrome.css

Removes the inline <style> block from index.html. All colors now come
from tokens. BrowserWindow.backgroundColor moves from warm gray (#1e1e1e)
to dark cool-blue (#1c1f25, the hex of --bg-0) so the cold-start flash
matches the new theme."
```

---

## Slice 1.5 — Terminal palette sync

**Outcome:** xterm.js terminal area inside each session matches the new dark cool-blue chrome palette.

### Task 1.5.1: Update xterm theme in TerminalHost

**Files:**
- Modify: `packages/terminal-host/src/terminal-host.ts` (lines 63-66, the `theme` block)

- [ ] **Step 1: Replace the xterm theme in `packages/terminal-host/src/terminal-host.ts`**

Find this block at lines 63-66:

```ts
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
      },
```

Replace with a full theme that mirrors `tokens.css`'s `--term-*` palette. xterm does NOT consume CSS variables, so values must be literal hex. The values below are the sRGB hex approximations of the oklch tokens (per the comments in `tokens.css`):

```ts
      theme: {
        background:    '#1c1f25', // --term-bg / --bg-0
        foreground:    '#e8eaee', // --term-fg
        cursor:        '#e8eaee',
        cursorAccent:  '#1c1f25',
        selectionBackground: '#7CA8E059', // --accent-glow
        // ANSI standard colors
        black:         '#1c1f25',
        red:           '#d27566', // --term-red
        green:         '#82c69b', // --term-green
        yellow:        '#d8c376', // --term-yellow
        blue:          '#7CA8E0', // --term-blue / --accent
        magenta:       '#c388d8', // --term-magenta
        cyan:          '#7dc3d4', // --term-cyan
        white:         '#e8eaee',
        // ANSI bright colors
        brightBlack:   '#5a5e66',
        brightRed:     '#e08879',
        brightGreen:   '#9bd6b3',
        brightYellow:  '#e8d489',
        brightBlue:    '#9ac2f0',
        brightMagenta: '#d39ce8',
        brightCyan:    '#92d5e8',
        brightWhite:   '#f4f5f7',
      },
```

- [ ] **Step 2: Typecheck and lint**

```bash
pnpm typecheck
pnpm lint
```

Both should exit 0. (xterm.js's `ITheme` type accepts all these fields as optional strings.)

- [ ] **Step 3: Build and run dev**

```bash
pnpm dev
```

Expected:
- App launches.
- The terminal area inside the first tab shows the new dark cool-blue background; prompt text appears in the new fg color.
- Type some commands; ANSI-colored output (e.g. `ls --color=auto` on bash, or `Get-ChildItem` on PowerShell which uses bright cyan / green) looks correct against the new background.

Close the app once verified.

- [ ] **Step 4: Run existing integration tests**

```bash
pnpm --filter @aipad/integration test
```

Expected: PASS. None of them assert on xterm theme.

- [ ] **Step 5: Commit**

```bash
git add packages/terminal-host/src/terminal-host.ts
git commit -m "feat(terminal): sync xterm theme with new chrome palette

Replaces the two-color xterm theme with a full ANSI palette derived
from --term-* tokens. xterm.js does not read CSS variables, so values
are literal hex matching the oklch tokens in tokens.css."
```

---

## Slice 2 — Custom titlebar

**Outcome:** A 32px custom titlebar above the tab strip. On Windows/Linux it contains the app glyph, five menu names (File / Tabs / View / Window / Help), and min/max/close window controls; the whole bar is draggable. On macOS it contains the app glyph (offset to clear the traffic lights) and a centered title only; the OS menu bar stays at the top of the screen. Menu names pop the *existing* native submenus via a new `ChromeMenuPopup` IPC.

### Task 2.1: Add `ChromeMenuPopup` + `ChromeWindowControl` IPC channels

Both new channels are needed by the custom titlebar (Task 2.5): one to pop named submenus at click coordinates, one to drive the minimize / maximize / close window controls.

**Files:**
- Modify: `packages/contracts/src/ipc.ts`

- [ ] **Step 1: Add the channel constants**

In `packages/contracts/src/ipc.ts`, in the `IpcChannel` object (around line 33), add these two lines right above the `// Events (main -> renderer)` comment:

```ts
  ChromeMenuPopup: 'core.chrome.menu-popup',
  ChromeWindowControl: 'core.chrome.window-control',
```

- [ ] **Step 2: Add the payload schemas**

In the same file, in the `// --- Request payloads ---` section (after `LayoutReorderTabsPayloadSchema`, around line 105), add:

```ts
/** Renderer asks main to popup() one of the named submenus from app-menu.ts at the
 * given screen coordinates. Used by the custom in-window titlebar on Windows/Linux. */
export const ChromeMenuPopupPayloadSchema = z.object({
  menu: z.enum(['File', 'Tabs', 'View', 'Window', 'Help']),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
});

/** Renderer asks main to drive the BrowserWindow's min/max/close controls.
 * Used by the custom in-window titlebar on Windows/Linux. */
export const ChromeWindowControlPayloadSchema = z.object({
  action: z.enum(['minimize', 'maximize', 'close']),
});
```

- [ ] **Step 3: Typecheck the contracts package**

```bash
pnpm --filter @aipad/contracts typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/ipc.ts
git commit -m "feat(contracts): add ChromeMenuPopup + ChromeWindowControl IPC

ChromeMenuPopup carries a submenu name plus screen coordinates so main
can popup() the existing submenu at the click location.
ChromeWindowControl carries minimize/maximize/close for the custom
titlebar's window-control buttons. Both are consumed by the new
in-window titlebar in apps/desktop on Windows/Linux."
```

### Task 2.2: Refactor `app-menu.ts` to expose submenus by name + add the IPC handler

**Files:**
- Modify: `apps/desktop/src/main/app-menu.ts`
- Modify: `apps/desktop/src/main/index.ts` (register the handler near the other `ipcMain.handle` calls)

- [ ] **Step 1: Rewrite `apps/desktop/src/main/app-menu.ts` to also export a named-popup helper**

Replace the entire file with this content:

```ts
import { Menu, type MenuItemConstructorOptions, BrowserWindow, type WebContentsView, shell } from 'electron';
import { Bindings } from '@aipad/keymap';
import { IpcChannel } from '@aipad/contracts';

function send(action: string, chromeWindow: () => BrowserWindow | null): void {
  const win = chromeWindow();
  win?.webContents.send(IpcChannel.ActionInvoke, { action });
}

export type MenuName = 'File' | 'Tabs' | 'View' | 'Window' | 'Help';

/** Templates per top-level menu so the custom titlebar can pop them individually.
 * `buildAppMenu` composes the same templates into the OS application menu. */
function buildTemplates(
  chromeWindow: () => BrowserWindow | null,
  getActiveTerminalView: () => WebContentsView | null,
): Record<MenuName, MenuItemConstructorOptions[]> {
  function sendTerminal(action: 'splitHorizontal' | 'splitVertical' | 'closePane'): void {
    const view = getActiveTerminalView();
    view?.webContents.send(IpcChannel.TerminalAction, { action });
  }

  const fileSubmenu: MenuItemConstructorOptions[] = [
    { role: 'quit' },
  ];

  const tabsSubmenu: MenuItemConstructorOptions[] = [
    { label: 'New Tab',      accelerator: Bindings.newTab.accelerator,   click: () => send('newTab', chromeWindow) },
    { label: 'Close Tab',    accelerator: Bindings.closeTab.accelerator, click: () => send('closeTab', chromeWindow) },
    { type: 'separator' },
    { label: 'Next Tab',     accelerator: Bindings.nextTab.accelerator,  click: () => send('nextTab', chromeWindow) },
    { label: 'Previous Tab', accelerator: Bindings.prevTab.accelerator,  click: () => send('prevTab', chromeWindow) },
    { type: 'separator' },
    ...Array.from({ length: 9 }, (_, i) => {
      const id = `jumpTab${i + 1}` as 'jumpTab1';
      return {
        label: `Tab ${i + 1}`,
        accelerator: Bindings[id].accelerator,
        click: () => send(id, chromeWindow),
      };
    }),
    { type: 'separator' },
    { label: 'Split Horizontally', accelerator: Bindings.splitHorizontal.accelerator, click: () => sendTerminal('splitHorizontal') },
    { label: 'Split Vertically',   accelerator: Bindings.splitVertical.accelerator,   click: () => sendTerminal('splitVertical') },
    { label: 'Close Pane',         accelerator: Bindings.closePane.accelerator,       click: () => sendTerminal('closePane') },
  ];

  const viewSubmenu: MenuItemConstructorOptions[] = [
    { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => send('openSettings', chromeWindow) },
    { type: 'separator' },
    { label: 'Toggle Sidebar', accelerator: Bindings.toggleSidebar.accelerator, click: () => send('toggleSidebar', chromeWindow) },
    { type: 'separator' },
    { role: 'reload' },
    { role: 'toggleDevTools' },
  ];

  const windowSubmenu: MenuItemConstructorOptions[] = [
    { role: 'togglefullscreen' },
    { type: 'separator' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { role: 'resetZoom' },
    { type: 'separator' },
    { role: 'minimize' },
    { role: 'close' },
  ];

  const helpSubmenu: MenuItemConstructorOptions[] = [
    {
      label: 'Report Issue…',
      click: () => { void shell.openExternal('https://github.com/ecogs-sys/AI.Pad/issues'); },
    },
  ];

  return {
    File: fileSubmenu,
    Tabs: tabsSubmenu,
    View: viewSubmenu,
    Window: windowSubmenu,
    Help: helpSubmenu,
  };
}

/**
 * Build the application menu. Accelerators on menu items fire OS-globally when the
 * app is focused, regardless of which WebContentsView (chrome vs. terminal) currently
 * has keyboard focus. This is the only way to make Ctrl+T / Ctrl+W / Ctrl+Tab / etc.
 * work without requiring the user to click on the chrome bar first.
 */
export function buildAppMenu(
  chromeWindow: () => BrowserWindow | null,
  getActiveTerminalView: () => WebContentsView | null,
): Menu {
  const t = buildTemplates(chromeWindow, getActiveTerminalView);
  return Menu.buildFromTemplate([
    { label: 'File',   submenu: t.File },
    { label: 'Tabs',   submenu: t.Tabs },
    { label: 'View',   submenu: t.View },
    { label: 'Window', submenu: t.Window },
    { label: 'Help',   submenu: t.Help },
  ]);
}

/** Build a one-off Menu for the named submenu so the custom titlebar can popup() it
 * at a specific (x, y). Rebuilt per call so click callbacks see fresh closures. */
export function buildSubmenu(
  name: MenuName,
  chromeWindow: () => BrowserWindow | null,
  getActiveTerminalView: () => WebContentsView | null,
): Menu {
  const t = buildTemplates(chromeWindow, getActiveTerminalView);
  return Menu.buildFromTemplate(t[name]);
}
```

- [ ] **Step 2: Register the `ChromeMenuPopup` + `ChromeWindowControl` handlers in `apps/desktop/src/main/index.ts`**

In `apps/desktop/src/main/index.ts`, add this import next to the existing `buildAppMenu` import (line 10):

```ts
import { buildAppMenu, buildSubmenu, type MenuName } from './app-menu.js';
```

And add the schema imports next to the existing `IpcChannel` import (line 7):

```ts
import { AppSettingsSchema, ResumeCancelPayloadSchema, ChromeMenuPopupPayloadSchema, ChromeWindowControlPayloadSchema } from '@aipad/contracts';
```

Then, after the existing `ipcMain.handle(IpcChannel.LayoutDefaultCwd, ...)` line (around line 134), add both handlers:

```ts
// IPC: custom titlebar in the chrome renderer asks main to pop one of the named
// submenus from app-menu.ts at the given screen coordinates. This lets the in-window
// menu bar share a single source of truth with the OS application menu — no item
// duplication, accelerators stay correct.
ipcMain.handle(IpcChannel.ChromeMenuPopup, (_e, raw): { ok: true } | { error: string } => {
  const parsed = ChromeMenuPopupPayloadSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.message };
  if (!chromeWindow) return { error: 'no chrome window' };
  const submenu = buildSubmenu(
    parsed.data.menu as MenuName,
    () => chromeWindow,
    () => focusedSessionId ? (viewManager?.get(focusedSessionId) ?? null) : null,
  );
  submenu.popup({
    window: chromeWindow,
    x: parsed.data.x,
    y: parsed.data.y,
  });
  return { ok: true };
});

// IPC: custom titlebar's min/max/close buttons drive the BrowserWindow.
ipcMain.handle(IpcChannel.ChromeWindowControl, (_e, raw): { ok: true } | { error: string } => {
  const parsed = ChromeWindowControlPayloadSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.message };
  if (!chromeWindow) return { error: 'no chrome window' };
  if (parsed.data.action === 'minimize') chromeWindow.minimize();
  else if (parsed.data.action === 'maximize') {
    if (chromeWindow.isMaximized()) chromeWindow.unmaximize();
    else chromeWindow.maximize();
  } else if (parsed.data.action === 'close') chromeWindow.close();
  return { ok: true };
});
```

- [ ] **Step 3: Typecheck and lint**

```bash
pnpm typecheck
pnpm lint
```

Both should exit 0.

- [ ] **Step 4: Smoke test that the OS application menu still works**

```bash
pnpm dev
```

Open the app. Confirm:
- The OS menu bar at the top of the screen (or the app's window menu on Win/Linux) now shows five names: File, Tabs, View, Window, Help.
- File → Quit works.
- Tabs → New Tab works (Ctrl+T accelerator still fires).
- View → Settings… opens the settings dialog (Ctrl+, still works).
- Window → Toggle Full Screen works.
- Help → Report Issue… opens the GitHub issues page in the default browser.

Close the app once verified.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/app-menu.ts apps/desktop/src/main/index.ts
git commit -m "feat(main): add Window + Help submenus, ChromeMenuPopup + ChromeWindowControl handlers

Refactors buildAppMenu to compose from per-submenu templates and exports
a new buildSubmenu(name) helper. Main registers ChromeMenuPopup
(popup() the named submenu at click coords) and ChromeWindowControl
(minimize/maximize/close the BrowserWindow). Both are consumed by the
custom titlebar in apps/desktop on Windows/Linux."
```

### Task 2.3: Update `BrowserWindow` options for frameless / hiddenInset

**Files:**
- Modify: `apps/desktop/src/main/index.ts` (lines 275-286, the `createChromeWindow` function)

- [ ] **Step 1: Make the BrowserWindow constructor options platform-conditional**

In `apps/desktop/src/main/index.ts`, find the `new BrowserWindow({...})` call inside `createChromeWindow()` (starts around line 276). Replace the whole construction with:

```ts
  const isMac = process.platform === 'darwin';
  chromeWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#1c1f25',
    icon: iconPath(),
    // Win/Linux: frameless so the in-window <div id="titlebar"> can render the menu
    // and window controls. macOS: keep the platform traffic lights but inset them so
    // they overlay our titlebar area; the in-window titlebar shows glyph + title only.
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const }
      : { frame: false }
    ),
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
    },
  });
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Manual smoke — confirm window still launches**

```bash
pnpm dev
```

Expected:
- On Windows/Linux: the OS title bar is GONE. There's an empty 32px-ish gap above `#tab-strip` (that's the layout grid leaving room — the titlebar div doesn't exist yet, that's Task 2.5).
- The window is **not yet draggable** anywhere (no drag region yet — Task 2.5 fixes this). Close via the OS shortcut (Alt+F4 / Cmd+Q) or kill the dev runner.
- On macOS: the traffic lights are still in the top-left of the window; the titlebar area shows native gloss.
- All existing keyboard shortcuts still work.

Close once verified.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/index.ts
git commit -m "feat(main): use frameless BrowserWindow on Win/Linux, hiddenInset on macOS

Removes the native title bar on Windows + Linux so the upcoming custom
in-window titlebar can own the chrome. On macOS we keep the platform
traffic lights via titleBarStyle: 'hiddenInset'."
```

### Task 2.4: Add the `#titlebar` div to index.html and grid row to chrome.css

**Files:**
- Modify: `apps/desktop/index.html`
- Modify: `apps/desktop/src/renderer/chrome/styles/chrome.css`

- [ ] **Step 1: Add `<div id="titlebar"></div>` to `apps/desktop/index.html`**

Insert it as the first child of `#chrome-root`. The body should look like:

```html
  <body>
    <div id="chrome-root">
      <div id="titlebar"></div>
      <div id="tab-strip"></div>
      <div id="body">
        <aside id="sidebar">
          <div id="sidebar-header">
            <span id="sidebar-label">Sessions</span>
            <button id="sidebar-toggle" title="Toggle sidebar (Ctrl+B)">⇔</button>
          </div>
          <div id="sidebar-list"></div>
        </aside>
        <div id="view-host"><div id="view-anchor"></div></div>
      </div>
    </div>
    <div id="dialog-mount"></div>
    <script type="module" src="/src/renderer/chrome/main.ts"></script>
  </body>
```

- [ ] **Step 2: Update `#chrome-root` grid in `chrome.css` to three rows + add titlebar base styles**

In `apps/desktop/src/renderer/chrome/styles/chrome.css`, find the `#chrome-root` rule (the one with `grid-template-rows: var(--tabbar-h) 1fr`). Replace it with:

```css
#chrome-root {
  display: grid;
  grid-template-rows: var(--titlebar-h) var(--tabbar-h) 1fr;
  height: 100%;
}
```

Then append at the bottom of the file:

```css
/* ── Titlebar ────────────────────────────────────────────────────────────── */
#titlebar {
  height: var(--titlebar-h);
  background: var(--bg-1);
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--border-1);
  user-select: none;
  flex-shrink: 0;
  -webkit-app-region: drag;
}
#titlebar .tb-glyph {
  display: flex;
  align-items: center;
  padding: 0 10px 0 12px;
}
#titlebar .tb-menu {
  display: flex;
  align-items: stretch;
  gap: 2px;
  -webkit-app-region: no-drag;
}
#titlebar .tb-menu-item {
  display: flex;
  align-items: center;
  padding: 0 8px;
  height: 100%;
  font-size: 12.5px;
  color: var(--text-2);
  cursor: pointer;
}
#titlebar .tb-menu-item:hover { background: var(--bg-3); color: var(--text-1); }
#titlebar .tb-title {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-3);
  letter-spacing: 0.2px;
}
#titlebar .tb-title b { color: var(--text-2); font-weight: 500; }
#titlebar .tb-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}
#titlebar .tb-ctrl {
  width: 46px;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  cursor: pointer;
}
#titlebar .tb-ctrl:hover { background: var(--bg-3); color: var(--text-1); }
#titlebar .tb-ctrl.close:hover { background: #c4534b; color: #fff; }

/* macOS: traffic lights sit in the top-left at (~14, ~12) with 70px of width.
 * Offset our glyph past them and hide the menu strip + window controls. */
#titlebar[data-platform="darwin"] .tb-glyph    { padding-left: 78px; }
#titlebar[data-platform="darwin"] .tb-menu     { display: none; }
#titlebar[data-platform="darwin"] .tb-controls { display: none; }
```

- [ ] **Step 3: Typecheck and run dev**

```bash
pnpm typecheck
pnpm dev
```

Expected:
- 32px empty cool-blue strip appears above the tab strip. No content in it yet (Task 2.5 adds the JS module that fills it).
- On Win/Linux: the strip is the only draggable area; drag the window by it to confirm. (The rest of the body has `-webkit-app-region: drag` inherited from the body... actually no — we only set drag on `#titlebar`. So drag should work only there.)
- On macOS: the strip appears; the OS traffic lights overlay its left edge.
- Tabs and sidebar still render below it.

Close once verified.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/index.html apps/desktop/src/renderer/chrome/styles/chrome.css
git commit -m "feat(chrome): add #titlebar grid row + platform-aware styles

Adds the 32px titlebar strip above the tab bar. On macOS the strip's
content is glyph + centered title; on Win/Linux it will contain a menu
strip and window controls (next task adds the JS module)."
```

### Task 2.5: Create `TitleBar` class

Both IPCs (`ChromeMenuPopup`, `ChromeWindowControl`) and their main-process handlers are already in place from Tasks 2.1 and 2.2. This task is purely the renderer module.

**Files:**
- Create: `apps/desktop/src/renderer/chrome/titlebar.ts`

- [ ] **Step 1: Write `apps/desktop/src/renderer/chrome/titlebar.ts`**

Create the file with this content:

```ts
import type { PreloadBridge } from '@aipad/terminal-host';
import { IpcChannel } from '@aipad/contracts';

const MENU_NAMES = ['File', 'Tabs', 'View', 'Window', 'Help'] as const;
type MenuName = (typeof MENU_NAMES)[number];

export interface TitleBarOptions {
  bridge: PreloadBridge;
  /** 'win32' | 'darwin' | 'linux' (etc.) — drives the platform-specific shape. */
  platform: string;
}

/**
 * Renders the 32px in-window titlebar. On macOS the bar shows only the app glyph
 * + centered title (the OS menu bar lives at the top of the screen and the traffic
 * lights overlay the bar's left edge). On Windows/Linux the bar shows the glyph,
 * the five menu names, and min/max/close window controls — and the menu names pop
 * the existing native submenus via the ChromeMenuPopup IPC.
 *
 * The whole bar has -webkit-app-region: drag; interactive children opt out via
 * .tb-menu / .tb-controls (no-drag), set in chrome.css.
 */
export class TitleBar {
  private readonly bridge: PreloadBridge;
  private readonly platform: string;

  constructor(private readonly root: HTMLElement, opts: TitleBarOptions) {
    this.bridge = opts.bridge;
    this.platform = opts.platform;
    root.dataset['platform'] = this.platform;
    this.render();
  }

  private render(): void {
    this.root.innerHTML = '';

    const glyph = document.createElement('div');
    glyph.className = 'tb-glyph';
    glyph.appendChild(this.renderGlyphSvg());
    this.root.appendChild(glyph);

    if (this.platform !== 'darwin') {
      const menu = document.createElement('div');
      menu.className = 'tb-menu';
      for (const name of MENU_NAMES) {
        const item = document.createElement('div');
        item.className = 'tb-menu-item';
        item.textContent = name;
        item.addEventListener('click', (ev) => {
          const target = ev.currentTarget as HTMLElement;
          const rect = target.getBoundingClientRect();
          void this.bridge.send(IpcChannel.ChromeMenuPopup, {
            menu: name satisfies MenuName,
            x: Math.round(rect.left),
            y: Math.round(rect.bottom),
          });
        });
        menu.appendChild(item);
      }
      this.root.appendChild(menu);
    }

    const title = document.createElement('div');
    title.className = 'tb-title';
    title.innerHTML = '<b>AI.Pad</b>';
    this.root.appendChild(title);

    if (this.platform !== 'darwin') {
      this.root.appendChild(this.renderControls());
    }
  }

  private renderGlyphSvg(): SVGSVGElement {
    // 16x16 app glyph — matches the AppGlyph in design/app.jsx.
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.style.display = 'block';

    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('width', '24');
    rect.setAttribute('height', '24');
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', '#2a2f38');
    svg.appendChild(rect);

    const dot = (cx: string, cy: string, fill: string): SVGCircleElement => {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', '1.6'); c.setAttribute('fill', fill);
      return c;
    };
    svg.appendChild(dot('7',  '9', '#9bc8a3'));
    svg.appendChild(dot('12', '9', '#7CA8E0'));
    svg.appendChild(dot('17', '9', '#e0c477'));

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M 7 15 L 10 17 L 7 19');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#e8eaee');
    path.setAttribute('stroke-width', '1.4');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    const bar = document.createElementNS(ns, 'rect');
    bar.setAttribute('x', '12'); bar.setAttribute('y', '18');
    bar.setAttribute('width', '5'); bar.setAttribute('height', '1.2');
    bar.setAttribute('rx', '0.6'); bar.setAttribute('fill', '#7CA8E0');
    svg.appendChild(bar);

    return svg;
  }

  private renderControls(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'tb-controls';

    const mkBtn = (className: string, title: string, svg: string, onClick: () => void): HTMLElement => {
      const btn = document.createElement('div');
      btn.className = `tb-ctrl ${className}`;
      btn.title = title;
      btn.innerHTML = svg;
      btn.addEventListener('click', onClick);
      return btn;
    };

    const minSvg = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" stroke-width="1"/></svg>';
    const maxSvg = '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
    const closeSvg = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1"/></svg>';

    wrap.appendChild(mkBtn('min',   'Minimize', minSvg,   () => void this.bridge.send(IpcChannel.ChromeWindowControl, { action: 'minimize' })));
    wrap.appendChild(mkBtn('max',   'Maximize', maxSvg,   () => void this.bridge.send(IpcChannel.ChromeWindowControl, { action: 'maximize' })));
    wrap.appendChild(mkBtn('close', 'Close',    closeSvg, () => void this.bridge.send(IpcChannel.ChromeWindowControl, { action: 'close' })));
    return wrap;
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/chrome/titlebar.ts
git commit -m "feat(chrome): add TitleBar module

Renders the in-window titlebar (glyph + menu items + window controls on
Win/Linux; glyph + centered title on macOS). Menu items dispatch
ChromeMenuPopup with screen coords from getBoundingClientRect; window
controls dispatch ChromeWindowControl. Both IPCs were added in Tasks
2.1 + 2.2."
```

### Task 2.6: Wire the TitleBar into `chrome/main.ts`

**Files:**
- Modify: `apps/desktop/src/renderer/chrome/main.ts`

- [ ] **Step 1: Import + instantiate `TitleBar` in chrome/main.ts**

Add the import next to the other class imports:

```ts
import { TitleBar } from './titlebar.js';
```

Add the element lookup near the other `getElementById` calls:

```ts
const titlebarEl = document.getElementById('titlebar')!;
```

Instantiate it (above the `LayoutManager` construction). It's a leaf — no callbacks back into the layout manager:

```ts
new TitleBar(titlebarEl, { bridge, platform: process.platform });
```

Note: `process.platform` is available because `webPreferences.contextIsolation: true` AND `sandbox: false` (see main/index.ts:283-284) — Node globals leak through. If you'd rather not rely on that, replace with `navigator.userAgent.includes('Mac') ? 'darwin' : navigator.userAgent.includes('Windows') ? 'win32' : 'linux'` — but the existing layout-manager.ts also uses `navigator.userAgent`, so consistency suggests using that instead. Use this:

```ts
const platform = navigator.userAgent.includes('Mac')     ? 'darwin'
              : navigator.userAgent.includes('Windows') ? 'win32'
              : 'linux';
new TitleBar(titlebarEl, { bridge, platform });
```

- [ ] **Step 2: Run dev**

```bash
pnpm dev
```

Expected (Windows/Linux):
- The 32px titlebar above the tab strip now shows the app glyph on the left, "File · Tabs · View · Window · Help" menu names, the "AI.Pad" title centered, and three window-control glyphs (min / max / close) on the right.
- Hover each menu name — background goes to `--bg-3`.
- Click a menu name (e.g. "Tabs"). The corresponding native submenu pops just below the click point. Selecting "New Tab" opens the New Session dialog.
- Drag the window by the titlebar — confirm it moves.
- Click min / max / close — confirm they minimize / maximize-toggle / close the window.

Expected (macOS):
- Titlebar shows the app glyph at ~78px from the left (clearing the traffic lights) and "AI.Pad" centered.
- The OS menu bar at the top of the screen still works.

- [ ] **Step 3: Run e2e smoke**

```bash
pnpm test:e2e -- smoke.spec.ts
```

Expected: PASS. The new `#titlebar` element appears but the test only asserts `#tab-strip` and `#sidebar` visibility — no change needed.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/chrome/main.ts
git commit -m "feat(chrome): mount TitleBar above tab strip

Renderer chrome boot now constructs a TitleBar for the #titlebar div.
On Windows/Linux it renders glyph + menu strip + window controls; on
macOS it renders glyph + centered title only and lets the OS chrome
provide the traffic lights and menu bar."
```

---

## Slice 3 — Tab strip reskin

**Outcome:** Tabs match the handoff visually — 36px tall, status-colored dot (with awaiting-state pulse ring), active-tab top stripe in `--accent`, restyled resume badge. No behavior change.

### Task 3.1: Update `tab-strip.ts` DOM shape

**Files:**
- Modify: `apps/desktop/src/renderer/chrome/tab-strip.ts`

- [ ] **Step 1: Replace the body of `render()` in `tab-strip.ts`**

Find the `render` method (lines 27-95). Keep the method signature unchanged. Replace the loop body so each tab emits this DOM:

```ts
  render(tabs: TabViewModel[], focusedId: SessionId | null): void {
    this.root.innerHTML = '';
    for (const tab of tabs) {
      const el = document.createElement('div');
      el.className = 'tab' + (tab.info.id === focusedId ? ' active' : '');
      el.dataset['sessionId'] = tab.info.id;

      // Active-tab top stripe — rendered as a pseudo-element via CSS (.tab.active::before)
      // OR an explicit element. Using an explicit child keeps the CSS simple.
      if (tab.info.id === focusedId) {
        const stripe = document.createElement('div');
        stripe.className = 'tab-stripe';
        el.appendChild(stripe);
      }

      // Status dot — color comes from status; resumeAt overrides to 'limited'.
      const dot = document.createElement('span');
      dot.className = 'dot';
      const isLimited = tab.resumeAt !== null;
      if (isLimited) dot.classList.add('limited');
      else if (tab.attention) dot.classList.add('awaiting');
      else if (tab.info.status === 'running') dot.classList.add('running');
      else if (tab.info.status === 'awaiting-input') dot.classList.add('awaiting');
      else if (tab.info.status === 'exited') dot.classList.add('idle');
      el.appendChild(dot);

      const title = document.createElement('span');
      title.className = 'title';
      const label = tab.info.title || tab.info.shell;
      title.textContent = tab.broken
        ? `⚠ ${label}`
        : tab.info.status === 'exited'
          ? `${label} (exited)`
          : label;
      el.appendChild(title);

      if (tab.resumeAt !== null) {
        const badge = document.createElement('span');
        badge.className = 'resume-badge limited';
        badge.textContent = `⏳ ${formatClock(tab.resumeAt)}`;
        badge.title = 'Auto-resume scheduled';
        el.appendChild(badge);
      }

      const close = document.createElement('span');
      close.className = 'close';
      close.textContent = '×';
      close.title = 'Close tab (Ctrl+W)';
      close.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.callbacks.onTabClose(tab.info.id);
      });
      el.appendChild(close);

      el.addEventListener('click', () => this.callbacks.onTabClick(tab.info.id));

      el.draggable = true;
      el.addEventListener('dragstart', (ev) => {
        ev.dataTransfer?.setData('text/plain', tab.info.id);
      });
      el.addEventListener('dragover', (ev) => ev.preventDefault());
      el.addEventListener('drop', (ev) => {
        ev.preventDefault();
        const draggedId = ev.dataTransfer?.getData('text/plain') as SessionId | undefined;
        if (!draggedId || draggedId === tab.info.id) return;
        this.callbacks.onTabReorder(draggedId, tab.info.id);
      });

      this.root.appendChild(el);
    }

    const plus = document.createElement('button');
    plus.id = 'new-tab';
    plus.textContent = '+';
    plus.title = 'New tab (Ctrl+T)';
    plus.addEventListener('click', () => this.callbacks.onNewTab());
    this.root.appendChild(plus);
  }
```

The class-name changes vs. the old code:
- Dot classes: `running | awaiting | limited | idle` (was `running | attention | exited`).
- New element: `.tab-stripe` (the top stripe on the active tab).
- Resume badge now also gets the `.limited` modifier class.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/chrome/tab-strip.ts
git commit -m "feat(chrome): rewrite tab DOM for status-aware reskin

Adds .tab-stripe element for the active-tab top stripe; renames dot
modifier classes to running/awaiting/limited/idle to match the new
palette; tags resume-badge with .limited so it can pick up the soft-red
treatment. Behavior unchanged."
```

### Task 3.2: Move tab styles into `chrome.css` with new visual rules

**Files:**
- Modify: `apps/desktop/src/renderer/chrome/styles/chrome.css`

- [ ] **Step 1: Replace the `/* ── Tab strip ── */` section in chrome.css**

Find the `/* ── Tab strip ── */` block (the rules from `#tab-strip { ... }` down through `#new-tab:hover { ... }`). Replace the whole block with:

```css
/* ── Tab strip ───────────────────────────────────────────────────────────── */
#tab-strip {
  height: var(--tabbar-h);
  display: flex;
  align-items: stretch;
  background: var(--bg-1);
  border-bottom: 1px solid var(--border-1);
  flex-shrink: 0;
  overflow: hidden;
}

.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  height: var(--tabbar-h);
  min-width: 160px;
  max-width: 220px;
  background: transparent;
  border-right: 1px solid var(--border-1);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tab.active        { background: var(--bg-0); color: var(--text-1); }
.tab .tab-stripe   { position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--accent); }

.tab .dot          { width: 7px; height: 7px; border-radius: 50%; background: transparent; flex-shrink: 0; }
.tab .dot.running  { background: var(--st-running); }
.tab .dot.awaiting { background: var(--st-awaiting); box-shadow: 0 0 0 3px var(--st-awaiting-ring); }
.tab .dot.limited  { background: var(--st-limited);  box-shadow: 0 0 0 3px var(--st-limited-ring);  }
.tab .dot.idle     { background: var(--st-idle); }

.tab .title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.tab .resume-badge {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--st-awaiting);
  white-space: nowrap;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--st-awaiting-bg);
}
.tab .resume-badge.limited {
  color: var(--st-limited);
  background: var(--st-limited-bg);
}

.tab .close {
  width: 14px; height: 14px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--text-4); font-size: 11px;
}
.tab .close:hover { color: var(--text-1); }

#new-tab { width: 36px; padding: 0; background: transparent; color: var(--text-3); cursor: pointer; border: none; font-size: 16px; }
#new-tab:hover { color: var(--text-1); }
```

- [ ] **Step 2: Run dev**

```bash
pnpm dev
```

Expected:
- Active tab has the dusty-blue top stripe.
- The status dot is sage green for `running`, warm amber with a glow ring for `awaiting-input`, soft red with ring for pending-resume (`limited`), neutral gray for `exited` (`idle`).
- Tabs are 36px tall, 160-220px wide, separated by hairline borders.
- × close glyph in muted gray; hovers to brighter.
- Resume badge appears as a small pill (test by toggling auto-resume on and triggering a fake limit phrase in a tab).

Close once verified.

- [ ] **Step 3: Run unit tests**

```bash
pnpm --filter @aipad/desktop test
```

Expected: PASS (the renderer chrome has no unit tests for tab DOM today; if any exist they need their class-name expectations updated alongside this slice).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/chrome/styles/chrome.css
git commit -m "feat(chrome): style tab strip per redesign

36px tabs with --accent top stripe on active. Status dot colors
keyed off running/awaiting/limited/idle modifier classes. Resume
badge becomes a soft-red/amber pill instead of inline text."
```

---

## Slice 4 — Sidebar rows reskin

**Outcome:** Sidebar rows match the handoff — 22px rounded shell-icon tile with a corner status dot, title/cwd/status-pill three-row layout, active-row left accent border, restyled header (uppercase "Sessions" + a `+` button) and footer ("N active"). Collapsed mode keeps working.

### Task 4.1: Update `sidebar.ts` to emit the new row shape

**Files:**
- Modify: `apps/desktop/src/renderer/chrome/sidebar.ts`

- [ ] **Step 1: Replace the `render` body in `sidebar.ts`**

Find the `render(rows: SidebarRowVm[], focusedId)` method. Keep the signature. Replace the body so each row emits the icon tile / title / cwd / pill structure. Also add the footer count line.

```ts
  render(rows: SidebarRowVm[], focusedId: SessionId | null): void {
    this.listEl.innerHTML = '';
    const now = Date.now();
    for (const row of rows) {
      const el = document.createElement('div');
      el.className =
        'sidebar-row' +
        (row.info.id === focusedId ? ' active' : '') +
        (row.attention ? ' attention' : '');
      el.dataset['sessionId'] = row.info.id;

      // Header row: icon tile + title
      const head = document.createElement('div');
      head.className = 'sr-head';

      const iconTile = document.createElement('div');
      iconTile.className = 'sr-icon';
      iconTile.textContent = SHELL_ICONS[row.info.shell] ?? '??';
      const cornerStatus = this.cornerDotClass(row);
      if (cornerStatus) {
        const dot = document.createElement('span');
        dot.className = `sr-icon-dot ${cornerStatus}`;
        iconTile.appendChild(dot);
      }
      head.appendChild(iconTile);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'sr-title title-text';
      titleSpan.textContent = row.info.title || row.info.shell;
      head.appendChild(titleSpan);

      el.appendChild(head);

      // cwd line
      const cwd = document.createElement('div');
      cwd.className = 'sr-cwd';
      cwd.textContent = row.info.cwd ?? '';
      el.appendChild(cwd);

      // pill: status + elapsed (or limited pill if pending resume)
      const pill = document.createElement('div');
      pill.className = 'sr-pill';
      const pillStatus = this.pillStatusClass(row);
      pill.classList.add(pillStatus);

      const pillDot = document.createElement('span');
      pillDot.className = 'sr-pill-dot';
      pill.appendChild(pillDot);

      const pillLabel = document.createElement('span');
      pillLabel.className = 'sr-pill-label';
      pillLabel.textContent = this.pillLabel(row);
      pill.appendChild(pillLabel);

      const ageSec = Math.max(0, Math.floor((now - row.statusSinceMs) / 1000));
      const pillTime = document.createElement('span');
      pillTime.className = 'sr-pill-time';
      pillTime.textContent = `· ${formatAge(ageSec)}`;
      pill.appendChild(pillTime);

      if (row.resumeAt !== null) {
        const cancel = document.createElement('span');
        cancel.className = 'sr-pill-cancel resume-cancel';
        cancel.textContent = '×';
        cancel.title = 'Cancel auto-resume';
        cancel.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.callbacks.onResumeCancel(row.info.id);
        });
        pill.appendChild(cancel);
      }

      el.appendChild(pill);

      el.addEventListener('click', () => this.callbacks.onRowClick(row.info.id));
      el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        this.showContextMenu(ev.clientX, ev.clientY, row.info.id);
      });
      this.listEl.appendChild(el);
    }
  }

  /** 'running' | 'awaiting' | 'limited' | 'idle' for the pill (matches handoff palette). */
  private pillStatusClass(row: SidebarRowVm): 'running' | 'awaiting' | 'limited' | 'idle' {
    if (row.resumeAt !== null) return 'limited';
    if (row.info.status === 'running') return 'running';
    if (row.info.status === 'awaiting-input') return 'awaiting';
    return 'idle';
  }

  /** Corner dot is only rendered for non-idle states (matches handoff). */
  private cornerDotClass(row: SidebarRowVm): '' | 'running' | 'awaiting' | 'limited' {
    if (row.resumeAt !== null) return 'limited';
    if (row.info.status === 'running') return 'running';
    if (row.info.status === 'awaiting-input') return 'awaiting';
    return '';
  }

  private pillLabel(row: SidebarRowVm): string {
    if (row.resumeAt !== null) return 'rate-limited';
    if (row.info.status === 'running') return 'running';
    if (row.info.status === 'awaiting-input') return 'awaiting input';
    return 'idle';
  }
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/chrome/sidebar.ts
git commit -m "feat(chrome): rewrite sidebar row DOM for status-aware reskin

Each row now has: an icon tile (with optional corner status dot), a
title line, a cwd line, and a status pill below (running/awaiting/
limited/idle) with elapsed time. Pending-resume cancel × lives inside
the limited pill."
```

### Task 4.2: Style the new sidebar row + restyle header + add footer

**Files:**
- Modify: `apps/desktop/index.html` (sidebar block — add a footer element)
- Modify: `apps/desktop/src/renderer/chrome/styles/chrome.css`

- [ ] **Step 1: Add the sidebar footer container to `index.html`**

In `apps/desktop/index.html`, update the `<aside id="sidebar">` block to include a footer:

```html
        <aside id="sidebar">
          <div id="sidebar-header">
            <span id="sidebar-label">Sessions</span>
            <button id="sidebar-toggle" title="Toggle sidebar (Ctrl+B)">⇔</button>
          </div>
          <div id="sidebar-list"></div>
          <div id="sidebar-footer"><span id="sidebar-count">0 active</span></div>
        </aside>
```

- [ ] **Step 2: Wire the footer count from LayoutManager**

In `apps/desktop/src/renderer/chrome/layout-manager.ts`, find the `render()` method (around line 345). At the end of the method, after `this.sidebar.render(rows, this.state.focusedId);`, add:

```ts
    const countEl = document.getElementById('sidebar-count');
    if (countEl) countEl.textContent = `${rows.length} active`;
```

- [ ] **Step 3: Replace the sidebar styles in chrome.css**

Find the `/* ── Body + sidebar ── */` section and the `.sidebar-row` block. Replace the entire `#sidebar`, `#sidebar-header`, `#sidebar-list`, `.sidebar-row`, and `body.sidebar-collapsed` rules with:

```css
/* ── Body + sidebar ──────────────────────────────────────────────────────── */
#body {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  height: 100%;
  min-height: 0;
}
#body.sidebar-collapsed { grid-template-columns: 36px 1fr; }

#sidebar {
  background: var(--bg-1);
  border-right: 1px solid var(--border-1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

#sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 1.2px;
  font-weight: 600;
}
#sidebar-toggle {
  background: transparent;
  border: none;
  color: var(--text-4);
  cursor: pointer;
  padding: 0 4px;
  font-size: 14px;
}
#sidebar-toggle:hover { color: var(--text-2); }

#sidebar-list { flex: 1; overflow-y: auto; padding-top: 4px; }

#sidebar-footer {
  border-top: 1px solid var(--border-1);
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-4);
}

.sidebar-row {
  position: relative;
  padding: 12px 14px 12px 16px;
  border-left: 2px solid transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: transparent;
}
.sidebar-row:hover  { background: var(--bg-2); }
.sidebar-row.active { background: var(--bg-3); border-left-color: var(--accent); }

.sidebar-row .sr-head { display: flex; align-items: center; gap: 10px; }

.sidebar-row .sr-icon {
  width: 22px; height: 22px;
  border-radius: 5px;
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 0.4px;
  position: relative;
  flex-shrink: 0;
}
.sidebar-row .sr-icon-dot {
  position: absolute; top: -3px; right: -3px;
  width: 8px; height: 8px; border-radius: 50%;
  border: 2px solid var(--bg-1);
}
.sidebar-row .sr-icon-dot.running  { background: var(--st-running); }
.sidebar-row .sr-icon-dot.awaiting { background: var(--st-awaiting); }
.sidebar-row .sr-icon-dot.limited  { background: var(--st-limited); }

.sidebar-row .sr-title {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--text-2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sidebar-row.active .sr-title { color: var(--text-1); }

.sidebar-row .sr-cwd {
  margin-left: 32px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-4);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.sidebar-row .sr-pill {
  margin-left: 32px;
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  padding: 2px 8px;
  border-radius: 999px;
  letter-spacing: 0.2px;
  line-height: 1.4;
  width: fit-content;
  max-width: calc(100% - 32px);
}
.sidebar-row .sr-pill-dot   { width: 5px; height: 5px; border-radius: 50%; }
.sidebar-row .sr-pill-label { white-space: nowrap; }
.sidebar-row .sr-pill-time  { color: var(--text-3); }
.sidebar-row .sr-pill-cancel {
  margin-left: 4px; padding: 0 2px; cursor: pointer; color: var(--text-3);
}
.sidebar-row .sr-pill-cancel:hover { color: var(--text-1); }

.sidebar-row .sr-pill.running  { color: var(--st-running);  background: var(--st-running-bg);  }
.sidebar-row .sr-pill.running  .sr-pill-dot { background: var(--st-running); }
.sidebar-row .sr-pill.awaiting { color: var(--st-awaiting); background: var(--st-awaiting-bg); }
.sidebar-row .sr-pill.awaiting .sr-pill-dot { background: var(--st-awaiting); }
.sidebar-row .sr-pill.limited  { color: var(--st-limited);  background: var(--st-limited-bg);  }
.sidebar-row .sr-pill.limited  .sr-pill-dot { background: var(--st-limited); }
.sidebar-row .sr-pill.idle     { color: var(--text-3);      background: var(--st-idle-bg);     }
.sidebar-row .sr-pill.idle     .sr-pill-dot { background: var(--st-idle); }

/* Collapsed sidebar: only the icon tile shows */
body.sidebar-collapsed .sidebar-row .sr-title,
body.sidebar-collapsed .sidebar-row .sr-cwd,
body.sidebar-collapsed .sidebar-row .sr-pill,
body.sidebar-collapsed #sidebar-label,
body.sidebar-collapsed #sidebar-footer { display: none; }
body.sidebar-collapsed .sidebar-row { padding: 8px; }
```

- [ ] **Step 4: Run dev and verify**

```bash
pnpm dev
```

Expected:
- Sidebar header shows uppercase "SESSIONS" + a ⇔ toggle button on the right (kept from existing for now; the design's `+` button on the header is Phase 2 since the existing `+` lives in the tab strip and on the new-session command path).
- Each row shows: 22px icon tile (PS / BA / etc.), title in mono, cwd line below, status pill below that.
- Active row has the dusty-blue left border + slightly lighter background.
- Pill color matches status; pending resume = soft-red pill with elapsed time + cancel ×.
- Sidebar footer at the bottom: "N active" right-aligned.
- Ctrl+B collapses the sidebar to 36px wide, hiding everything except the icon tiles.

Close once verified.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/index.html apps/desktop/src/renderer/chrome/layout-manager.ts apps/desktop/src/renderer/chrome/styles/chrome.css
git commit -m "feat(chrome): style sidebar rows + header + footer per redesign

Each row is a three-line block: icon tile + title, cwd, status pill.
Active row gets a --accent left border and --bg-3 background. Footer
shows session count. Collapsed mode keeps just the icon tiles."
```

---

## Slice 5 — Dialogs reskin

**Outcome:** Settings, New Session, and Rename dialogs match the handoff visually — sectioned cards on `--bg-2` with proper toggle controls, focus rings, and accent-colored primary buttons. Same submit/cancel/escape behavior.

### Task 5.1: Restyle the Settings dialog (`<SettingsModal>` from screens.jsx)

**Files:**
- Modify: `apps/desktop/src/renderer/chrome/settings-dialog.ts`
- Modify: `apps/desktop/src/renderer/chrome/styles/chrome.css` (append dialog styles)

- [ ] **Step 1: Rewrite the inner HTML of the settings dialog**

In `apps/desktop/src/renderer/chrome/settings-dialog.ts`, replace the assignment to `root.innerHTML` (lines 18-32 of the current file) with this richer markup. Keep the rest of the function (event wiring, cleanup, submit logic, focus handling) unchanged — only the HTML and class names change:

```ts
    root.className = 'dialog dialog-settings';
    root.innerHTML = `
      <div class="dlg-titlebar">
        <div class="dlg-eyebrow">
          <span class="dlg-eyebrow-label">SETTINGS</span>
          <span class="dlg-eyebrow-dot"></span>
          <span class="dlg-eyebrow-title">Auto-resume</span>
        </div>
        <button class="dlg-close" id="set-close" title="Close">×</button>
      </div>

      <section class="dlg-section dlg-toggle-row">
        <button id="set-enabled-toggle" type="button" class="dlg-switch" role="switch" aria-checked="false"><i></i></button>
        <input id="set-enabled" type="checkbox" hidden />
        <div>
          <div class="dlg-toggle-title">Auto-resume rate-limited tabs</div>
          <div class="dlg-toggle-help">When an agent hits its quota and you've set a response below, AI.Pad will send that response automatically once the quota refreshes.</div>
        </div>
      </section>

      <section class="dlg-section">
        <div class="dlg-label">TEXT TO DETECT</div>
        <input id="set-detect" type="text" maxlength="200" class="dlg-input" />
      </section>

      <section class="dlg-section">
        <div class="dlg-label">RESPONSE TO SEND</div>
        <input id="set-response" type="text" maxlength="200" class="dlg-input" />
      </section>

      <div class="dlg-footer">
        <button id="set-cancel" class="dlg-btn">Cancel</button>
        <button id="set-save" class="dlg-btn dlg-btn-primary">Save</button>
      </div>
    `;
```

Add a click handler that mirrors the new toggle button to the hidden checkbox so the rest of the existing function (which reads `enabledEl.checked`) keeps working. Add this block right after the `cancelEl` declaration:

```ts
    const toggleEl = root.querySelector<HTMLButtonElement>('#set-enabled-toggle')!;
    const setToggle = (on: boolean): void => {
      enabledEl.checked = on;
      toggleEl.setAttribute('aria-checked', on ? 'true' : 'false');
      toggleEl.dataset['on'] = on ? '1' : '0';
    };
    setToggle(current.autoResume.enabled);
    toggleEl.addEventListener('click', () => setToggle(!enabledEl.checked));
    root.querySelector<HTMLButtonElement>('#set-close')!.addEventListener('click', () => cleanup(null));
```

- [ ] **Step 2: Append dialog styles to chrome.css**

Append at the bottom of `apps/desktop/src/renderer/chrome/styles/chrome.css`:

```css
/* ── Dialogs (sectioned card) ───────────────────────────────────────────── */
#dialog-mount { backdrop-filter: blur(2px); }

.dialog {
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: 10px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04);
  padding: 0;
  min-width: 480px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-1);
  overflow: hidden;
}
.dialog.dialog-settings { width: 560px; }

.dlg-titlebar {
  padding: 14px 22px;
  border-bottom: 1px solid var(--border-1);
  display: flex; align-items: center; justify-content: space-between;
}
.dlg-eyebrow { display: flex; align-items: center; gap: 10px; }
.dlg-eyebrow-label {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-4);
  text-transform: uppercase;
  letter-spacing: 1.4px;
}
.dlg-eyebrow-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--text-4); }
.dlg-eyebrow-title { font-size: 13px; color: var(--text-1); }
.dlg-close {
  width: 22px; height: 22px;
  background: transparent; border: 0; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--text-3); font-size: 14px; line-height: 1;
  border-radius: 4px;
}
.dlg-close:hover { background: var(--bg-3); color: var(--text-1); }

.dlg-section { padding: 18px 22px; border-bottom: 1px solid var(--border-1); }
.dlg-toggle-row { display: flex; align-items: flex-start; gap: 14px; }
.dlg-toggle-title { font-size: 13.5px; color: var(--text-1); font-weight: 500; margin-bottom: 3px; }
.dlg-toggle-help  { font-size: 12px; color: var(--text-3); line-height: 1.5; }

.dlg-switch {
  width: 36px; height: 20px;
  border-radius: 999px;
  background: var(--bg-3);
  position: relative; flex-shrink: 0;
  border: 0; padding: 0; cursor: pointer;
  margin-top: 2px;
  transition: background 0.15s;
}
.dlg-switch i {
  position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.dlg-switch[data-on="1"]   { background: var(--accent); }
.dlg-switch[data-on="1"] i { transform: translateX(16px); }

.dlg-label {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 6px;
}

.dlg-input {
  width: 100%;
  background: var(--bg-0);
  border: 1px solid var(--border-2);
  border-radius: 6px;
  padding: 9px 12px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--text-1);
  outline: none;
  box-sizing: border-box;
}
.dlg-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.dlg-footer {
  padding: 14px 22px;
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
}
.dlg-btn {
  background: transparent;
  color: var(--text-2);
  border: 1px solid var(--border-2);
  border-radius: 6px;
  padding: 7px 14px;
  font-family: var(--font-sans);
  font-size: 12.5px;
  cursor: pointer;
}
.dlg-btn:hover { color: var(--text-1); background: var(--bg-3); }
.dlg-btn-primary {
  background: var(--accent);
  color: #0d1117;
  border-color: var(--accent);
  font-weight: 600;
  padding: 7px 16px;
}
.dlg-btn-primary:hover { background: #6a96cd; color: #0d1117; }
```

- [ ] **Step 3: Run dev and exercise Settings**

```bash
pnpm dev
```

Open Settings (Ctrl+,). Confirm:
- 560px card on `--bg-2`, soft shadow.
- Eyebrow: "SETTINGS · Auto-resume". × in the top right.
- Three sections separated by hairline borders.
- The toggle is a real pill switch — clicking toggles ON / OFF (accent fill).
- The two inputs show the focus ring (dusty blue) when focused.
- Cancel + Save in the footer. Save is `--accent`-filled.
- Save persists, Cancel/Escape dismisses. `Enter` submits.

Close once verified.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/chrome/settings-dialog.ts apps/desktop/src/renderer/chrome/styles/chrome.css
git commit -m "feat(chrome): style settings dialog per redesign

Sectioned card with eyebrow label, pill toggle switch (replacing the
checkbox visually while keeping the underlying input wired), accent
focus rings on inputs, and accent-filled Save button. Submit/cancel/
escape behavior unchanged."
```

### Task 5.2: Restyle the New Session + Rename dialogs

**Files:**
- Modify: `apps/desktop/src/renderer/chrome/new-session-dialog.ts`

- [ ] **Step 1: Update `showNewSessionDialog` markup**

In `apps/desktop/src/renderer/chrome/new-session-dialog.ts`, replace the `root.innerHTML` assignment (lines 26-44) with:

```ts
    root.className = 'dialog dialog-new-session';
    root.innerHTML = `
      <div class="dlg-titlebar">
        <div class="dlg-eyebrow">
          <span class="dlg-eyebrow-label">NEW</span>
          <span class="dlg-eyebrow-dot"></span>
          <span class="dlg-eyebrow-title">Session</span>
        </div>
        <button class="dlg-close" id="ns-close" title="Close">×</button>
      </div>

      <section class="dlg-section">
        <div class="dlg-label">SHELL</div>
        <select id="ns-shell" class="dlg-input">
          <option value="pwsh">PowerShell 7 (pwsh)</option>
          <option value="powershell">Windows PowerShell</option>
          <option value="cmd">Command Prompt</option>
          <option value="bash">bash</option>
          <option value="zsh">zsh</option>
          <option value="wsl">WSL</option>
        </select>
      </section>

      <section class="dlg-section">
        <div class="dlg-label">WORKING DIRECTORY</div>
        <input id="ns-cwd" type="text" class="dlg-input" />
      </section>

      <div class="dlg-footer">
        <button id="ns-cancel" class="dlg-btn">Cancel</button>
        <button id="ns-open" class="dlg-btn dlg-btn-primary">Open</button>
      </div>
    `;
```

And after `cancelEl` is declared, add:

```ts
    root.querySelector<HTMLButtonElement>('#ns-close')!.addEventListener('click', () => cleanup(null));
```

- [ ] **Step 2: Update `showRenameDialog` markup**

In the same file (`new-session-dialog.ts`), find `showRenameDialog` and replace the `root.innerHTML` assignment (lines 100-110) with:

```ts
    root.className = 'dialog dialog-rename';
    root.innerHTML = `
      <div class="dlg-titlebar">
        <div class="dlg-eyebrow">
          <span class="dlg-eyebrow-label">RENAME</span>
          <span class="dlg-eyebrow-dot"></span>
          <span class="dlg-eyebrow-title">Tab</span>
        </div>
        <button class="dlg-close" id="rn-close" title="Close">×</button>
      </div>

      <section class="dlg-section">
        <div class="dlg-label">TITLE</div>
        <input id="rn-title" type="text" class="dlg-input" />
      </section>

      <div class="dlg-footer">
        <button id="rn-cancel" class="dlg-btn">Cancel</button>
        <button id="rn-ok" class="dlg-btn dlg-btn-primary">Rename</button>
      </div>
    `;
```

And after `cancelEl` in `showRenameDialog`:

```ts
    root.querySelector<HTMLButtonElement>('#rn-close')!.addEventListener('click', () => cleanup(null));
```

- [ ] **Step 3: Add a small select-arrow style to chrome.css (selects look bad without it)**

Append:

```css
select.dlg-input {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 28px;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(177,180,186,0.7)' d='M0 0h10L5 6z'/></svg>");
  background-repeat: no-repeat;
  background-position: right 10px center;
  cursor: pointer;
}
```

- [ ] **Step 4: Typecheck and run dev**

```bash
pnpm typecheck
pnpm dev
```

Open New Tab (Ctrl+T). Confirm:
- 480px+ card matching the Settings dialog's surface.
- Eyebrow: "NEW · Session".
- Shell select shows a custom dropdown arrow.
- Cwd input has accent focus ring.
- Open button is accent-filled.
- Submit/cancel/escape/enter all work.

Right-click a tab → Rename. Confirm:
- Eyebrow: "RENAME · Tab".
- Same card style.

Close once verified.

- [ ] **Step 5: Run e2e settings test**

```bash
pnpm test:e2e -- settings.spec.ts
```

Expected: PASS. If selectors changed (e.g. the test looked up `#set-enabled` by checkbox semantics), update the test to click `#set-enabled-toggle` instead. Inspect first:

```bash
cat tests/e2e/settings.spec.ts
```

If the test toggles via `#set-enabled` checkbox.check() / .uncheck(), change to clicking `#set-enabled-toggle` and asserting `[data-on="1"]`.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/chrome/new-session-dialog.ts apps/desktop/src/renderer/chrome/styles/chrome.css
git commit -m "feat(chrome): style new-session and rename dialogs per redesign

Both dialogs now use the same .dialog / .dlg-* classes as the settings
dialog. Submit/cancel/escape/enter behavior unchanged."
```

### Task 5.3: Final pass — smoke test the whole app + e2e

- [ ] **Step 1: Run all checks**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

Expected: all PASS. If any e2e selector still depends on a class string changed in Slices 3-5, fix the test, not the production string.

- [ ] **Step 2: Manual end-to-end smoke**

```bash
pnpm dev
```

Walk the don't-break list from the spec:

- All Ctrl+ shortcuts: T, W, Tab, Shift+Tab, 1–9, B, \, Shift+\, Shift+W, ,.
- Drag-to-reorder tabs.
- Sidebar right-click context menu (Rename, Duplicate, Restart, Close).
- Open Settings → toggle auto-resume → save → close → reopen → confirm persisted.
- Trigger a fake rate-limit phrase in a tab → confirm soft-red dot on tab, soft-red pill on sidebar row with cancel × → click × → confirm cancellation.
- Toggle sidebar collapsed mode (Ctrl+B) → confirm only icon tiles show; rows are still clickable.
- Click each titlebar menu name on Windows/Linux → confirm submenus pop, items work.
- Drag the window by the titlebar.

If anything breaks, file an issue or fix inline. The spec's "Don't-break list" is the ground truth.

- [ ] **Step 3: Compare against the standalone preview**

Open `docs/design_handoff_aipad_redesign/AI.Pad Redesign (standalone).html` in a browser. Side-by-side with the running app, verify the visual parity targets:
- Same titlebar layout (Win/Linux).
- Same tab strip look (top stripe on active, status dots).
- Same sidebar row look (icon tile, pill, cwd line).
- Same settings dialog look (eyebrow, toggle, focus ring).

Note any drift; small numerical differences (1-2px) are acceptable. Major drift (wrong color family, missing border) is a bug — file or fix.

- [ ] **Step 4: Final commit if needed**

If any small fixes shake out from step 2 or 3, commit them with a descriptive message. Otherwise no commit.

---

## Done

After Slice 5, the redesign is at visual parity with the handoff (within scope). Phase 2 items (command palette, empty state, status-overview header, app icon swap, `rate-limited` as a first-class status, removing the redundant `attention` boolean) remain queued and are intentionally outside this plan.

Each slice committed cleanly is independently revertible. If a slice causes a regression on a specific OS, that single commit can be reverted without touching the others.
