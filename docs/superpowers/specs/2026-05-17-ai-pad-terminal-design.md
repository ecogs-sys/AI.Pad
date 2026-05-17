# AI.Pad — Design Spec

**Date:** 2026-05-17
**Status:** Approved (brainstorm), pending implementation plan
**Stage:** Stage 1 (production-quality first release)

---

## 1. Problem & promise

Working with multiple AI coding agents (Claude Code, Codex CLI, and similar) in parallel today means juggling several terminal windows, none of which know that the agent inside is asking you a question. You either hover over them all or miss prompts and lose minutes.

**AI.Pad** is a cross-platform desktop terminal that runs many sessions side-by-side and surfaces — across every tab — when any session needs your attention.

**Core promise:** *Run multiple projects at the same time, each tab a different session, and see progress and answer any question in one app.*

Sessions are normal PTY-backed terminals (PowerShell, bash, cmd, wsl, or any CLI). The "agent awareness" sits on top of standard terminal behavior — it does not require, but benefits from, cooperation from the CLI inside.

## 2. Stage 1 scope

In scope for the first release:

- Tabs: new / close / switch / reorder, keyboard-driven
- Per-tab shell + cwd picker (pwsh, cmd, bash, wsl, custom)
- Per-session PTY (`node-pty`) rendered with `xterm.js`
- Splits within a tab (horizontal / vertical, VS Code-style)
- Collapsible **sidebar** with live per-session status (running / awaiting input / exited, time-in-state)
- Tab-strip **attention badges** when a background session signals it needs input
- Native **OS notifications** when the window is unfocused or the user is on a different tab
- **Session persistence** across app restarts (shell, cwd, title, layout). PTYs respawn fresh; agent conversation state is *not* restored.
- **Cross-platform** from day one: Windows, macOS, Linux
- One built-in dark theme; settings UI deferred to a later stage

Explicitly deferred to **Stage 2 or later:**

- **Overview tab** (grid view of all sessions). Architecture supports it cheaply later (per-session ring buffer is already in place); the UI surface is the deferred cost.
- Themes / settings UI
- Cloud sync of layouts
- Native agent-protocol integration (we wrap CLIs, we don't speak their APIs)
- Auto-restart of failed sessions (manual "Restart" button only)

## 3. Runtime & key decisions

| Decision | Choice | Why |
|---|---|---|
| Desktop runtime | Electron | Largest ecosystem, fastest path to a polished cross-platform terminal; same stack as VS Code's terminal. RAM cost accepted as a known tradeoff. |
| Terminal renderer | `xterm.js` + `FitAddon` + `WebLinksAddon` | De-facto standard. |
| PTY layer | `node-pty` | Industry-standard native PTY bindings. |
| App language | TypeScript (strict) across main, renderers, contracts | Single language, typed IPC. |
| Process model | One chrome renderer + **one `WebContentsView` per session** | Per-tab isolation: a single tab's renderer crash never takes another tab down. |
| Packaging | `electron-builder` with auto-update | NSIS / DMG / AppImage targets. |
| Windows default shell | PowerShell 7+ (`pwsh`), fallback to `powershell.exe` | Modern default; user can pick others per tab. |
| Attention detection | Terminal BEL (`\x07`) + idle-after-prompt heuristic + OSC escape `\x1b]1337;AIPadAttention=…\x07` (future cooperative hook) | Works today with no agent cooperation; can be made richer later. |
| Persistence format | JSON files in Electron `userData` | Human-readable, simple. Atomic write via temp-file + rename. |
| Testing | Vitest (unit + integration), Playwright (E2E against built Electron) | Standard for this stack. |

## 4. Architecture — three planes

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CHROME PLANE (1 renderer)                       │
│  TabStrip · Sidebar · StatusBar · NewSessionDialog · LayoutManager     │
└─────────────────────────────────▲──────────────────────────────────────┘
                                  │   IPC (typed via @aipad/contracts)
┌─────────────────────────────────┴──────────────────────────────────────┐
│                        CORE PLANE (main process)                       │
│   SessionManager · Session(×N) · RingBuffer · AttentionDetector        │
│            SessionStore · NotificationService · IpcRouter              │
└──────▲────────────────────────────────────▲─────────────────────────▲──┘
       │                                    │                         │
       │ IPC (per session)                  │ spawn/I/O               │ Notification
       │                                    │                         │
┌──────┴───────────────┐         ┌──────────┴──────────┐    ┌─────────┴─────────┐
│   SESSION PLANE      │ × N     │   node-pty children │    │   OS notification │
│ WebContentsView      │         │   (pwsh / bash / …) │    │   center / dock   │
│ TerminalHost (xterm) │         │                     │    │                   │
└──────────────────────┘         └─────────────────────┘    └───────────────────┘
```

- The **Chrome plane** never talks to PTYs. It only renders state and forwards user intent.
- The **Session plane** is N independent renderers, each hosting one xterm bound to one PTY by ID. No cross-session knowledge.
- The **Core plane** is the single source of truth. PTY ownership, ring buffers, attention detection, persistence, and OS-level notifications all live here.

## 5. Component reference

### Core plane (main / Node.js)

- **`SessionManager`** — owns `Map<SessionId, Session>`. API: `create(opts)`, `attach(view)`, `detach()`, `write(id, bytes)`, `resize(id, cols, rows)`, `close(id)`, `list()`. Events: `session:created`, `session:exited`, `session:attention`, `session:title-changed`.
- **`Session`** — one PTY (`IPty`) + `RingBuffer` + metadata `{ id, title, shell, cwd, env, status, attachedViewId? }`.
- **`RingBuffer`** — fixed-size circular byte buffer, default ~256 KB (~5 000 lines). API: `write(chunk)`, `snapshot()`, `tail(n)`. UTF-8-safe boundaries.
- **`AttentionDetector`** — `stream.Transform` watching PTY stdout. Emits `{ sessionId, signal: 'bell' | 'idle' | 'osc', confidence: 0..1, snippet }`. Idle heuristic: ≥1.5 s of no output after a recognised prompt marker.
- **`SessionStore`** — persistence to `userData/sessions.json` and `userData/layout.json`. Atomic write (temp + rename), debounced (250 ms). On corrupt load: back up as `<name>.broken-<ts>` and start fresh.
- **`NotificationService`** — wraps Electron `Notification`. Coalesces (max one per session per 30 s). Click → focuses window and activates that session.
- **`IpcRouter`** — namespaced channels (`core.session.*`, `core.layout.*`, `core.notification.*`). Inputs validated against Zod schemas from `@aipad/contracts`; validation failure → structured error, never crash.

### Session plane (one renderer per tab)

- **`TerminalHost`** — boots `xterm.js` Terminal + `FitAddon` + `WebLinksAddon`. Subscribes to its session over IPC (`onData`, `onExit`, `onResize`). Sends keystrokes as `write(bytes)`. Zero awareness of other sessions.
- **`SplitContainer`** — when user splits a tab, hosts a binary tree of `TerminalHost` panes. Each pane is its own `Session` in the core; splits are purely a renderer-side layout concern. Resize drags update both panes' `resize(cols, rows)`.

### Chrome plane (single chrome renderer)

- **`TabStrip`** — new / close / switch / reorder; tab shows title, status dot, attention badge.
- **`Sidebar`** — collapsible left rail listing all sessions: shell icon, title, status, time-in-state, attention. Click → focus tab. Context menu: close, rename, duplicate.
- **`StatusBar`** — focused session's shell, cwd, PID, exit code on exit.
- **`NewSessionDialog`** — shell picker + cwd picker (with recent list).
- **`LayoutManager`** — tab order, sidebar collapsed/expanded, split trees. Persists via core.

### Shared

- **`@aipad/contracts`** — TypeScript types + Zod schemas for every IPC message. Both sides import the same package; schema version embedded for forward-compat.
- **`@aipad/keymap`** — keyboard shortcut registry. Stage 1 defaults: `Ctrl+T` new, `Ctrl+W` close, `Ctrl+Tab`/`Ctrl+Shift+Tab` next/prev, `Ctrl+1..9` jump, `Ctrl+\` split right, `Ctrl+Shift+\` split down, `Ctrl+B` toggle sidebar.

## 6. Data flows

**App start.** Load `sessions.json` + `layout.json` → create chrome window → mount chrome from persisted layout → for each persisted session, `SessionManager.create({ restore: true })` (fresh PTY in saved cwd/shell) → attach `WebContentsView` → focus last-active tab. UI shows "Restored session — agent conversation not preserved" on restored tabs.

**New session.** `+` or `Ctrl+T` → `NewSessionDialog` → `core.session.create({ shell, cwd, env, title })` → spawn `node-pty`, wire stdout through `AttentionDetector` into `RingBuffer` and the per-session IPC fan-out → create `WebContentsView`, load terminal page, bind by `sessionId` → persist (debounced) → broadcast `session:created` → `TabStrip` + `Sidebar` add entries; new view is focused.

**Keystroke (hot path).** xterm `onData(bytes)` → IPC `core.session.write(id, bytes)` (Buffer transferable) → `pty.write(bytes)` → child stdout → `node-pty 'data'` → `AttentionDetector` (passthrough bytes → `RingBuffer.write` + fan-out IPC `core.session.data(id, bytes)`; structured signals → `attention` event) → `TerminalHost.write(bytes)` → xterm renders. Background tabs receive data too — their renderers stay alive and in sync; switching is a `WebContentsView` visibility flip, not a remount.

**Attention.** `AttentionDetector` → `SessionManager.emit('attention', payload)` (sets `status = 'awaiting-input'`, timestamp) → IPC broadcast to chrome (`TabStrip` badges, `Sidebar` highlights + timer) → `NotificationService.maybeNotify` (only if window unfocused *or* that session not focused, *and* outside 30 s coalescing window; OS notification, click → focus window + activate session). Attention auto-clears on next user keystroke into that session.

**Close session.** ✕ / `Ctrl+W` / shell exit → `core.session.close(id)` (or PTY `exit`) → `SessionManager` kills PTY (`SIGHUP`), destroys `WebContentsView`, removes from store → broadcast `session:closed` → UI removes entries; if it was focused, the most-recently-active remaining session is focused.

**App shutdown.** Block default close → for each session: soft-exit prompt + `SIGHUP`, wait ≤1.5 s → `SessionStore.flush()` (synchronous final write) → destroy window, `app.exit`.

## 7. Error handling & resilience

- **PTY spawn failure** (missing shell): caught pre-spawn, surfaced in `NewSessionDialog`; no tab created.
- **PTY mid-life exit** (zero or non-zero): tab stays as a read-only `exited` state with shell exit code in status bar and a manual **Restart** button. *No* auto-restart.
- **Session renderer crash** (`render-process-gone`): destroy the view, recreate it, replay `RingBuffer.snapshot()` into the fresh xterm, resume live data. PTY keeps running throughout. If a view crashes twice in 60 s, stop auto-recovering — surface a "Tab needs restart" state.
- **IPC contract violation**: Zod validation at both ends; failure → structured error response + log line, never crashes main.
- **Persistence failure** (disk full / permissions / lock): in-memory state remains correct; non-blocking status-bar warning ("Layout not saved: …"); retry with backoff; sessions keep running.
- **Corrupt persistence file**: back up to `.broken-<ts>`, start fresh — app always launches.
- **Sleep / resume / display change**: `FitAddon` re-fits on `window.resize` and `powerMonitor.resume`.
- **Notification permission denied** (macOS): UI badges remain ground truth; fall back to dock badge / taskbar flash.
- **Second app launch**: `app.requestSingleInstanceLock()` — second launch focuses the existing window.
- **Crash diagnostics**: Electron Crashpad minidumps in `userData/Crashpad/`; main-process exceptions to `userData/logs/main-<date>.log` with rotation.

Principle: *a fault in one session never takes down another, and the PTY is the unit we work hardest to keep alive.*

## 8. Testing strategy

**Unit (Vitest, no Electron).**
- `AttentionDetector` — canned streams (BEL, prompts, OSC, chunks split mid-escape); assert signals + snippets. Highest-leverage suite — the differentiator's quality lives here.
- `RingBuffer` — overflow, snapshot/tail correctness, multi-byte UTF-8 not split.
- `SessionStore` — round-trip, atomic write (write/crash/read), corrupt-file recovery.
- `@aipad/contracts` schemas — exhaustive valid/invalid examples.
- `LayoutManager` — tab + split tree manipulation (reorder, split, close, restore).

**Integration (Vitest + real `node-pty`, main only).**
- Real `pwsh`/`bash` against `SessionManager`: create → write → read → resize → close round-trip; concurrent sessions don't cross streams; PTY exit propagates.
- Scripted attention scenarios: tiny script prints output, then `printf '\a'`, waits for input → assert `attention` event with `signal: 'bell'`.
- Persistence: create N sessions → persist → new `SessionManager` from same store → confirm recreated with right cwd/shell.
- Crash recovery: simulate view destroy/recreate against `RingBuffer.snapshot()` → confirm replay produces identical xterm state.

**End-to-end (Playwright + built Electron).**
- App boots, creates a tab, types a command, sees output.
- Open 3 tabs; script in tab 2 bells while tabs 1 and 3 are focused → assert tab 2 badges, sidebar updates, OS notification fires.
- Close window, reopen → persisted tabs reappear with correct cwd.
- Split tab horizontally; type in both panes; confirm independent PTYs.

No xterm rendering snapshots — too brittle.

**CI matrix.** GitHub Actions: `windows-latest`, `macos-latest`, `ubuntu-latest`. Unit + integration on all three per PR. E2E on Linux per PR + one rotating other OS per PR; full matrix on `main`.

**Coverage.** ≥90% Core plane (`SessionManager`, `AttentionDetector`, `RingBuffer`, `SessionStore`); ≥70% chrome renderer logic. xterm-host code measured by Playwright, not coverage.

**Pre-release manual checklist.** Install on each OS, open 6 tabs of different shells, run a long-running agent in one, sleep/wake the machine, confirm everything still works.

## 9. Repository layout

```
ai.pad/
├── apps/
│   └── desktop/                 electron-builder entry, packaging configs
├── packages/
│   ├── core/                    main-process code (SessionManager, AttentionDetector, …)
│   ├── chrome/                  chrome renderer (TabStrip, Sidebar, StatusBar, …)
│   ├── terminal-host/           per-session renderer (TerminalHost, xterm wiring)
│   ├── contracts/               IPC types + Zod schemas (@aipad/contracts)
│   └── keymap/                  shortcut registry (@aipad/keymap)
├── tests/
│   ├── unit/                    Vitest specs colocated by package
│   ├── integration/             real-PTY suites
│   └── e2e/                     Playwright + Electron
├── docs/
│   └── superpowers/specs/       this file
└── .github/workflows/           cross-OS CI matrix
```

Monorepo, npm workspaces (or pnpm — pick during plan). One TypeScript project references graph; everything compiled with strict mode.

## 10. Open items for the implementation plan

These are not blocking the design but the plan should pick them:

1. **Monorepo tool**: npm workspaces vs pnpm. (Lean: pnpm — handles native `node-pty` rebuilds across OSes more cleanly.)
2. **xterm-headless for background sessions**: revisit when Stage 2 (Overview) lands. Out of Stage 1.
3. **Auto-update channel**: stable only, or a beta channel from day 1.
4. **Signing / notarisation**: required for macOS distribution outside personal use; needs an Apple Developer account.
5. **Prompt-marker library** for the idle heuristic (which CLIs do we recognise out of the box).
