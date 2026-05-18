# AI.Pad

Cross-platform tabbed terminal that runs many sessions in parallel and surfaces — across every tab — when any session needs your attention.

This repository is in active development.

## Status

| Stage | Plan | Status |
|---|---|---|
| Stage 1 | Plan 1 — Foundations | complete |
| Stage 1 | Plan 2 — Multi-tab + attention | complete |
| Stage 1 | Plan 3 — Splits + persistence + packaging | not started |
| Stage 2 | Overview tab | not started |

## Quick start (development)

**Prerequisites:** Node.js 20+, pnpm 9+, and (on Windows) PowerShell 7 (`pwsh.exe`) on PATH.

Open a terminal at the project root and run:

```bash
pnpm install     # one-time: fetches ~600 packages (Electron, node-pty, xterm, etc.) — a few minutes
pnpm dev         # launches the Electron app via electron-vite
```

A native window should appear with one PowerShell session inside it.

## Verify your install (Plan 1 manual smoke)

After `pnpm dev` opens the window, walk through this checklist:

1. **Window appears** — roughly 1280×800, dark background.
2. **Top strip** shows the label `Plan 1 — single fixed session`.
3. **Below the strip** there is an `xterm` terminal showing a PowerShell prompt (looks like `PS C:\Users\<you>>`).
4. **Type a command and press Enter:**
   - `Get-Date` → today's date prints.
   - `ls` → directory listing prints.
   - `1 + 1` → prints `2`.
5. **Close the window** (click the ✕). The Electron process tree should exit cleanly. Optionally open Task Manager and confirm no orphan `electron.exe` or `pwsh.exe` is left behind.

If any step fails, the dev terminal (where you ran `pnpm dev`) will usually show the error. Open DevTools inside the app with `Ctrl+Shift+I` if you need to inspect renderer logs.

### Run the automated tests

```bash
pnpm test        # 7 unit (RingBuffer) + 3 integration (real PowerShell PTY) = 10 tests
pnpm test:e2e    # 1 Playwright smoke that boots the built app and checks the chrome label
```

`pnpm test` may print harmless `AttachConsole failed` lines from node-pty's ConPTY teardown on Windows — those are stderr noise, not failures. The summary line should show `10 passed`.

## Keyboard shortcuts (Plan 2)

| Shortcut | Action |
|---|---|
| `Ctrl+T` | New tab (default shell at `$HOME`) |
| `Ctrl+W` | Close focused tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+1` … `Ctrl+9` | Jump to tab 1–9 |
| `Ctrl+B` | Toggle sidebar |

When a background tab needs your input (e.g., an agent prompts you), the tab badges with a yellow dot and a desktop notification fires (unless that tab is already focused). Clicking the notification focuses the window and switches to that tab.

## Layout

| Path | Contents |
|---|---|
| `packages/contracts/` | Typed IPC messages, Session types, Zod schemas |
| `packages/core/` | Main-process logic: `SessionManager`, `Session`, `RingBuffer`, `IpcRouter` |
| `packages/terminal-host/` | Renderer-side xterm.js wrapper |
| `packages/keymap/` | Keyboard shortcut registry (grows in Plan 2/3) |
| `apps/desktop/` | Electron application — main, preload, renderers |
| `tests/integration/` | Real-PTY tests against `SessionManager` |
| `tests/e2e/` | Playwright tests against the packaged app |
| `docs/superpowers/specs/` | Design spec(s) |
| `docs/superpowers/plans/` | Implementation plan(s) |

## Scripts

| Command | Effect |
|---|---|
| `pnpm dev` | Run the Electron app in dev mode (Vite HMR for renderers, electron-vite for main) |
| `pnpm build` | Build all packages and the Electron app |
| `pnpm test` | Unit + integration tests (Vitest) |
| `pnpm test:e2e` | Playwright smoke against the built app |
| `pnpm typecheck` | TypeScript across all packages |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |
