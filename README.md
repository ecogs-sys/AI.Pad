# AI.Pad

Cross-platform tabbed terminal that runs many sessions in parallel and surfaces — across every tab — when any session needs your attention.

This repository is in active development.

## Status

| Stage | Plan | Status |
|---|---|---|
| Stage 1 | Plan 1 — Foundations | complete |
| Stage 1 | Plan 2 — Multi-tab + attention | complete |
| Stage 1 | Plan 3 — Splits + persistence + packaging | complete |
| Stage 2 | Overview tab | not started |

## Quick start (development)

**Prerequisites:** Node.js 20+, pnpm 9+, and (on Windows) PowerShell 7 (`pwsh.exe`) on PATH.

Open a terminal at the project root and run:

```bash
pnpm install     # one-time: fetches ~600 packages (Electron, node-pty, xterm, etc.) — a few minutes
pnpm dev         # launches the Electron app via electron-vite
```

A native window should appear with one PowerShell session inside it.

## Installation (pre-built)

Pre-built installers for Windows / macOS / Linux are published as GitHub Releases on every tag push.

- **Windows:** `AI.Pad Setup x.y.z.exe` — NSIS installer.
- **macOS:** `AI.Pad-x.y.z.dmg` — drag to Applications.
- **Linux:** `AI.Pad-x.y.z.AppImage` — `chmod +x` and run.

The app auto-updates from GitHub Releases on next launch.

> **Release builds:** `electron-builder.json` sets `mac.identity: null` so local
> `pnpm dist` works without certificates. A signed/notarised macOS release must
> override this (supply an Apple Developer ID via `CSC_LINK` / `CSC_KEY_PASSWORD`
> or a release-specific config). Obtaining the certificates is out of scope here.

## Verify your install (manual smoke)

After `pnpm dev` opens the window, walk through this checklist:

1. **Window appears** — roughly 1280×800, dark background, with a tab strip across
   the top and a collapsible sidebar on the left.
2. **The first tab** hosts an `xterm` terminal showing a shell prompt (PowerShell on
   Windows, `bash`/`zsh` elsewhere).
3. **Type a command and press Enter** — e.g. `Get-Date`, `ls`, `1 + 1`.
4. **`Ctrl+T`** opens the New Session dialog; pick a shell + cwd → a second tab opens.
5. **`Ctrl+\`** splits the focused tab into two panes; **`Ctrl+Shift+W`** closes a pane.
6. **Close the window** (✕). The Electron process tree should exit cleanly — confirm
   no orphan `electron.exe` / `pwsh.exe` in Task Manager.

If any step fails, the dev terminal (where you ran `pnpm dev`) will usually show the
error. Open DevTools inside the app with `Ctrl+Shift+I` to inspect renderer logs.

### Run the automated tests

```bash
pnpm test        # Vitest: ~42 core unit + ~6 real-PTY integration tests
pnpm test:e2e    # Playwright: smoke + multi-tab + splits against the built app
```

`pnpm test` may print harmless `AttachConsole failed` lines from node-pty's ConPTY
teardown on Windows — those are stderr noise, not failures.

## Keyboard shortcuts (Plan 2)

| Shortcut | Action |
|---|---|
| `Ctrl+T` | New tab (default shell at `$HOME`) |
| `Ctrl+W` | Close focused tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+1` … `Ctrl+9` | Jump to tab 1–9 |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+\` | Split focused pane horizontally |
| `Ctrl+Shift+\` | Split focused pane vertically |
| `Ctrl+Shift+W` | Close focused pane |

When a background tab needs your input (e.g., an agent prompts you), the tab badges with a yellow dot and a desktop notification fires (unless that tab is already focused). Clicking the notification focuses the window and switches to that tab.

## Persistence

Open tabs persist across restarts. Each tab remembers its shell, cwd, and title; PTYs respawn fresh on relaunch (conversation history inside agents like `claude` is not preserved).

The persisted state lives in your platform's userData directory:

- Windows: `%APPDATA%\AI.Pad\sessions.json`
- macOS: `~/Library/Application Support/AI.Pad/sessions.json`
- Linux: `~/.config/AI.Pad/sessions.json`

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
