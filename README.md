# AI.Pad

Cross-platform tabbed terminal that runs many sessions in parallel and surfaces — across every tab — when any session needs your attention.

This repository is in active development.

## Status

| Stage | Plan | Status |
|---|---|---|
| Stage 1 | Plan 1 — Foundations | complete |
| Stage 1 | Plan 2 — Multi-tab + attention | not started |
| Stage 1 | Plan 3 — Splits + persistence + packaging | not started |
| Stage 2 | Overview tab | not started |

## Quick start (development)

Requires: Node.js 20+, pnpm 9+, and (on Windows) PowerShell 7 (`pwsh.exe`) on PATH.

```bash
pnpm install
pnpm dev
```

A window opens with one PowerShell session.

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
