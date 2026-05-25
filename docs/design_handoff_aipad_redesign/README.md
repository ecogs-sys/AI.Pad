# Handoff: AI.Pad Redesign

Visual + interaction spec for the AI.Pad Electron app — a multi-session terminal built around AI coding agents (Claude Code, Codex CLI, etc.). This package replaces the current UI with a refined dark, mono-forward chrome and adds new UX for the multi-agent workflow.

---

## What's in this folder

```
design_handoff_aipad_redesign/
├── README.md                          ← this file (the spec)
├── AI.Pad Redesign (standalone).html  ← ★ double-click to preview offline
└── vanilla-ts/                        ← implementation reference (no React)
    ├── README.md                      ← how to use this folder
    ├── demo.html                      ← live preview (open in browser)
    ├── tokens.css                     ← ★ design tokens (CSS variables)
    ├── components.css                 ← BEM-ish component styles
    ├── bundle.ts                      ← (generated, demo-only)
    ├── types.ts                       ← Session, Status, BadgeStyle, …
    ├── platform.ts                    ← kbd() / matchShortcut() / MOD
    ├── dom.ts                         ← h(), s(), setChildren()
    ├── icons.ts                       ← appGlyph, iconA/B/C, winCtrlGlyph
    ├── status-badge.ts                ← renderStatusBadge
    ├── chrome.ts                      ← TitleBar, TabBar, Sidebar
    ├── terminal.ts                    ← TerminalPane + Line model
    ├── panels.ts                      ← modals · palette · empty · md pane
    │                                    · new session dialog · scrim
    └── mocks.ts                       ← all sample data for the demo
```

**Before reading code:** open `AI.Pad Redesign (standalone).html` — single self-contained file that works offline. All eight screens + the three icon directions in one scrolling page.

**For implementation:** read this README for the spec, then the `vanilla-ts/` folder. Everything in there is plain TypeScript + DOM, no React. The component shapes are recommendations — adapt them to whatever module patterns the AI.Pad codebase already uses.

## Fidelity

**High-fidelity.** All colors, type sizes, spacing, and radii in this spec are final. Use the exact values in `vanilla-ts/tokens.css` as your source of truth.

---

## Tech notes for an Electron renderer

A few things in this design require Electron-specific wiring; everything else is normal renderer work.

1. **Custom titlebar.** Set `frame: false` (Win/Linux) or `titleBarStyle: 'hidden'` (macOS) on the `BrowserWindow`. Mark the titlebar container with `-webkit-app-region: drag` and the menu items + window-control buttons with `-webkit-app-region: no-drag`. On macOS, leave 80px of left-side padding for the traffic-light overlay (don't render your own controls there). On Windows/Linux, render the three controls shown in the design on the right.
2. **Window controls.** Wire min / max / close to `window.minimize() / window.maximize()` (or `unmaximize` when already maximized) / `window.close()` over IPC. Use `BrowserWindow.on('maximize'|'unmaximize')` to swap the maximize-icon glyph.
3. **Menu bar.** AI.Pad currently uses native menus. The custom titlebar inlines `File / Tabs / View / Window / Help` next to the app icon. Build these as a custom dropdown menu component or fall through to `electron.Menu.buildFromTemplate(...).popup()` triggered from each menu button.
4. **Native notifications.** Replace the current bottom-right toast with the existing `new Notification(...)` path. We are not redesigning that surface in this round.
5. **Persisted state.** Status colors, working directories, time-in-state all come from your existing session-tracking layer — the redesign is purely a render change.

## Cross-platform shortcuts

⚠ **Don't hardcode `⌘`** — see `vanilla-ts/platform.ts` for the cross-platform helpers. Use `kbd('Mod+K')` everywhere shortcuts appear in UI; use `matchShortcut(e, 'Mod+K')` for event handlers. `Mod` resolves to Cmd on macOS and Ctrl on Windows/Linux. macOS uses no `+` separator (`⌘⇧P`), Win/Linux keeps the joiners (`Ctrl+Shift+P`). For Electron's main-process accelerator strings, use `CommandOrControl+K` — Electron auto-translates it.

The README in `vanilla-ts/` covers this in detail.

---

## Screens

There are eight screens, plus three app-icon directions. Numbered in the order they appear on the preview page.

### 1. Main · single session
**Purpose:** baseline state with one active session.
**Layout:** titlebar (32px) → tab bar (36px) → body row of `[sidebar 260px] [terminal pane fill]`.
**Notable:** sidebar shows the status-overview header (4 cells: await / limited / running / idle) above the single session row.

### 2. Multi-session · attention sort
**Purpose:** the headline state — the user has 4 sessions and one is awaiting input.
**Layout:** same as Main; sidebar shows 4 session rows.
**Sort order:** sessions are listed with *awaiting* first, then *limited*, then *running*, then *idle* — this is the "attention sort" — so the row that needs the user always floats to the top.
**Tab bar:** 4 tabs, the awaiting one has a soft glow ring on its status dot.

### 3. Split panes
**Purpose:** two terminals side-by-side inside one tab.
**Layout:** identical chrome; the terminal pane is split into two equal columns with a 1px `var(--border-2)` divider. Each pane has a small uppercase mono label in the top-left.

### 4. Empty state · onboarding
**Purpose:** first launch / no sessions.
**Layout:** titlebar only (no tab bar) → centered 540px content stack: app icon + wordmark, 2 quick-start cards (`New session` accented, `Resume`), then a list of recent projects.

### 5. Settings · Auto-resume modal
**Purpose:** preferences. Currently scoped to the auto-resume feature.
**Layout:** dimmed scrim over the multi-session screen; modal is 560px wide, centered with 120px top padding, `border-radius: 10px`.
**Sections (top → bottom):** header strip with "Settings · Auto-resume" breadcrumb + close × · toggle row with description · text-to-detect input (focused, with accent ring + 3 quick-add chips) · response-to-send input · footer with rule count and Cancel / Save buttons.

### 6. Command palette · ⌘K (new)
**Purpose:** quick switcher / action launcher.
**Layout:** same scrim over the multi screen; modal is 620px wide, max 520px tall, `border-radius: 12px`.
**Top:** `⌘K` glyph + search query (with blinking accent caret) + esc hint chip.
**Body:** three sections — `SWITCH TO SESSION`, `START SESSION`, `ACTIONS`. Active row is highlighted with `var(--bg-3)` + 2px left border in accent.
**Bottom:** keyboard-hint strip + result count.
**Open with Mod+K, close with Esc.**

### 7. Markdown preview · sliding right pane (new)
**Purpose:** when an agent references one or more `.md` files in its output, those paths become clickable links. Clicking opens a 460px sliding pane on the right that renders the file. Devs can keep reading the agent's output while reviewing — terminal stays visible to the left, just narrower.

**Detection.** Watch the PTY stream for file references. Recommended pattern: a regex over rendered lines that matches `[\w./-]+\.md\b` and verifies the path exists relative to the session's `cwd` (cache the existence check for ~30s; mark non-existent paths as "proposed" but still clickable — the agent may be about to create them). Render hits as terminal hyperlinks using xterm.js's `WebLinksAddon` with a custom matcher, or via OSC 8 escape sequences if your terminal lib supports them.

**Link styling in-terminal.** Same color as `--accent`, underline at `--accent` 40% alpha, offset 3px. On hover: full-opacity underline + pointer cursor.

**Layout (right pane):**
- Width: 460px default, resizable via the left-edge gutter (drag handle, min 320, max 720), persisted per window.
- Mini tab strip across top (36px): the last 5 files opened in this session, LRU-evicted. Active file's tab matches the main tab-bar styling.
- Path bar (40px): full path in mono 11px (`~/AI.Pad/` muted, then bold path), modified-time on the right, two small actions: ↗ open in `$EDITOR`, ⎘ copy path.
- Body: `var(--bg-0)` background, 20/22px padding. Renders markdown using `--font-sans` for prose and `--font-mono` for inline code (`var(--bg-3)` chip background) and code blocks (`var(--term-bg)` background, 1px `--border-1` border, 6px radius).
- Footer (28px): keyboard hints (`esc` close, `Mod+[` prev file, `Mod+]` next file) on the left, file stats (LOC + size) on the right.

**Behaviour:**
- Click an `.md` link in terminal → if pane is closed, slide open (transition: `transform: translateX(0)`, 180ms ease-out); if already open, swap the active file with no animation.
- Pane is **per-window**, not per-tab. Switching tabs keeps the pane open but its mini-tab strip is **per-session** — switching to another tab/session shows the files that tab's agent has referenced.
- Esc closes the pane.
- File watcher: subscribe to `chokidar`/`fs.watch` on the open file; on change, debounce 200ms then re-render.

**Edge cases:**
- File doesn't exist → render an empty pane body with `<file path> (not yet created)` in `var(--text-3)`. Link in terminal still shows as clickable but in `var(--text-3)` instead of `--accent`.
- File outside workspace → allowed; just shows the absolute path in the path bar.
- File > 1 MB → don't auto-render. Show a placeholder + "Open in editor" button.
- Code blocks wider than pane → horizontal scroll inside the block, never break the layout.

**State sketch:**
```ts
interface MarkdownPaneState {
  open: boolean;
  width: number;            // px, persisted
  activeFile: string | null;
  recentFiles: Record<sessionId, string[]>;  // LRU per session, cap 5
  fileCache: Record<string, { content: string; mtime: number }>;
}
```

### 8. New session dialog (new)
**Purpose:** configure a session before launching it. Opened by clicking `+` in the tab bar or sidebar, or pressing `Mod+N`. Replaces a previous flow that dumped users into a default pwsh prompt and made them manually `cd` and run their agent.

**Layout.** 620px wide modal, max-height `calc(100vh - 80px)`. Standard `aip-modal` header (`NEW SESSION · Configure` breadcrumb + close ×), scrolling body wrapped in `.aip-modal__body`, sticky footer with Cancel / Start session.

**Sections (top → bottom):**

1. **Type** — 3-up segmented control. Each card: 22×22 kind chip + 13px title + small mono description. Active card gets accent border + soft accent glow.
   - Claude Code (default, "Recommended" badge in top-right of card)
   - Codex CLI
   - Shell only — pwsh / bash / cmd
2. **Working directory** — single-line `.aip-path-input` field with the path (parent dir muted, current dir bright) + a "Browse…" button on the right (opens native file picker). Below: row of mono chips showing the last 3–5 directories used (clicking populates the field).
3. **Shell** — radio row. Shells filtered to what's available on the current OS:
   - Windows: `pwsh.exe`, `cmd.exe`, `git-bash`
   - macOS: `zsh`, `bash`
   - Linux: `bash`, `zsh`
4. **Initial prompt** *(only shown when Type = Claude / Codex)* — multi-line textarea, 76px min-height. Sent verbatim to the agent on start. Empty is OK.
5. **Open in** — radio row: `New tab` / `Split right` / `Split below`. Default `New tab`.

**Behavior:**
- First mount: focus the **Type** segmented control; arrow keys cycle through the three.
- `Enter` triggers Start session (when at least working directory is set).
- `Esc` cancels.
- Draft state is **persisted to localStorage** on every change keyed by `aipad.newSession.draft.{cwd-hash}` — if the user accidentally closes the dialog they don't lose typed prompts. Cleared after a successful start.

**On submit (`onStart` callback):**
```ts
interface NewSessionState {
  type: 'claude' | 'codex' | 'shell';
  cwd: string;
  shell: 'pwsh' | 'cmd' | 'bash' | 'zsh' | 'git-bash';
  initialPrompt: string;
  openIn: 'tab' | 'split-right' | 'split-below';
  name?: string;
}
```
- Spawn a PTY in `cwd` with the chosen `shell`.
- If `type ≠ shell`, immediately `write` the binary name (`claude` / `codex`) + newline into the PTY.
- If `initialPrompt` is non-empty, wait for the binary's first prompt token (look for the agent's input cue), then `write(initialPrompt + '\n')`.
- Create a new `Session` record with status `running`, push to `sessions`, route to the right surface based on `openIn`.

**Edge cases:**
- `cwd` doesn't exist → red border on the field + tiny inline error "directory not found" below it. Start button stays disabled.
- Agent binary not found on PATH → start the shell anyway, surface the error in the terminal pane on the next line so the user sees it and can install/fix.
- User picks `Split below` with no active tab → fallback to `New tab`; show the choice flip in the footer as a subtle hint instead of erroring.

---

## Component spec

All sizes are in CSS pixels at 1× scale. The vanilla-ts files in `vanilla-ts/` are the canonical implementation reference; this section is a written summary.

### TitleBar — 32px tall
- Background: `var(--bg-1)`, bottom: `1px solid var(--border-1)`.
- Row layout (left → right): `[16px AppGlyph at 10/12px padding] [menu items, 12.5px Inter, 8px h-padding each, var(--text-2)] [flex spacer with centered title — "AI.Pad" 12px var(--text-2) weight 500, subtitle "— pwsh.exe" 12px var(--text-4) with 10px left margin] [WindowControls]`.
- WindowControls: three 46×32px hit zones, color `var(--text-2)`, SVG icons. On hover: background `var(--bg-3)`, close button hover background `oklch(0.55 0.18 25)`.

### TabBar — 36px tall
- Background: `var(--bg-1)`, bottom: `1px solid var(--border-1)`.
- Each tab: 160-220px width, `padding: 0 14px`, JetBrains Mono 12px, right border `1px solid var(--border-1)`.
- Active tab: background flips to `var(--bg-0)` (matches the terminal pane below) and a 2px accent stripe sits along the top edge.
- Awaiting-state tabs get a soft glow ring on the status dot.
- After the last tab: a 36×36 `+` button (opens the New session dialog).

### Sidebar — 260px wide
- Background: `var(--bg-1)`, right: `1px solid var(--border-1)`.
- **Header (40px):** `SESSIONS` label (mono 10.5px, uppercase, weight 600, `var(--text-3)`) on the left; two ghost icon buttons (sort `⇅` and new `+`) on the right.
- **Status overview strip:** 4 equal cells with vertical dividers. Each cell: status-color dot + count (mono 16px, tabular-nums) + tiny uppercase label.
- **Session row** (described below).
- **Footer (32px):** top border, mono 10.5px. Left: `⌘K palette` (auto-translated to `Ctrl+K` on Win/Linux). Right: `N active`.

### Session row
- Padding: `12px 14px 12px 16px`. Active row gets `background: var(--bg-3)` + a 2px accent left border.
- Top line: `[22px kind chip + small status corner-dot] [name, mono 12.5px, ellipsis]`.
  - Kind chip: 22×22, `border-radius: 5px`, `background: var(--bg-3)`, `border: 1px solid var(--border-2)`, mono 9px weight 600 letter-spacing 0.4px. Shows shell prefix (`PS` for PowerShell, `BSH` for bash, `ZSH`, etc.).
  - Status corner dot: 8px circle absolutely positioned `top: -3px; right: -3px` on the kind chip, `border: 2px solid var(--bg-1)`. Only rendered when status ≠ `idle`.
- Middle line: working directory, mono 10.5px `var(--text-4)`, ellipsis, indented 32px.
- Bottom line: `<StatusBadge style="pill" />`, indented 32px.

### StatusBadge — 3 styles
All use mono. Default is **pill**. The `status-badge.ts` file in `vanilla-ts/` shows all three render paths.

### Terminal pane
- Background: `var(--term-bg)`. Default padding 18px.
- Lines render at JetBrains Mono 12.5px, line-height 1.6.
- AI agent blocks get a 2px left border in `--term-magenta` and a `▎` glyph prefix per line.
- Tool-call lines start with `⏵` in `--term-cyan` and an optional dimmed result trailing after two spaces.
- Markdown file references become clickable links in `--accent` with a soft underline.

---

## Interactions & behavior

| Surface | Trigger | Behavior |
| --- | --- | --- |
| Tab | Click | Activate tab; pane swaps with no transition. |
| Tab | Middle-click or `×` | Close tab with confirm if status is `running` or `awaiting`. |
| Tab `+` | Click | Open New Session dialog (see section 8). |
| Session row | Click | Activate that tab (rows mirror tabs 1:1). |
| Session row | Right-click | Context menu: Rename, Duplicate, Move to new window, Close. |
| Status overview cell | Click | Filter sidebar to that status; click again to clear. |
| Command palette | `Mod+K` | Open palette. `↑↓` navigates, `↵` opens, `Esc` closes. |
| Settings input chips | Click | Replace the input value with the chip's text. |
| Auto-resume toggle | Click | Persist via existing settings store. |
| `.md` link in terminal | Click | Open the markdown preview pane (see section 7). |
| Awaiting tab dot | Auto | Soft pulse animation (1.4s ease-in-out, scale 1 → 1.08 → 1, opacity 1 → 0.6 → 1). Optional polish. |
| Window drag | Titlebar | Native drag via `-webkit-app-region: drag`. |

### Sort behaviour for sidebar / tabs

Sidebar rows are sorted by status priority, then by time-in-state descending. Tabs **do not** auto-resort — they keep user order — but sidebar can resort live. Tab order is the canonical user-controlled order; sidebar is a status-aware view.

```
priority = { awaiting: 0, limited: 1, running: 2, idle: 3 }
```

---

## Design tokens

See `vanilla-ts/tokens.css` for a paste-ready CSS file. Drop into your renderer's global stylesheet, reference everything via `var(--token-name)`.

Highlights:
- Accent color is dusty-blue (`#7CA8E0`) — premium feel, doesn't fight terminal output. Configurable via tokens.
- Status palette: sage green (running), warm amber (awaiting), soft red (limited), neutral (idle). All derived from `oklch()` for perceptual consistency.
- Type ramp uses **Inter** for UI chrome and **JetBrains Mono** for everything code-adjacent. Both via Google Fonts; pre-load locally for offline launches.

---

## State model (sketch)

```ts
type Status = 'running' | 'awaiting' | 'limited' | 'idle';

interface Session {
  id: string;
  kind: 'PS' | 'BSH' | 'ZSH' | 'CMD' | string;
  name: string;           // user-editable, defaults to binary
  cwd: string;            // tildified for display
  binary: string;         // 'pwsh.exe', 'claude', 'codex', …
  status: Status;
  statusSince: number;    // ms timestamp
  awaitingPromptText?: string;
  rateLimit?: { resetsAt: number };
}

interface AppState {
  sessions: Session[];
  activeSessionId: string;
  tabOrder: string[];     // canonical user-controlled order
  paletteOpen: boolean;
  newSessionOpen: boolean;
  settingsOpen: 'auto-resume' | null;
  mdPane: MarkdownPaneState;
  splitMap: Record<string, string[]>; // tabId → array of session ids in that tab
}
```

Time formatter for the in-state durations:
```ts
function formatTime(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d`;
}
```

---

## App icon

Three directions in the preview page under "App icon".

- **Direction A** — refined evolution of the current icon (rounded square + status dots + cursor).
- **Direction B** — the pad as a physical notepad surface; plays nicely with the "Pad" half of the name.
- **Direction C** — stacked sessions; visualizes the product's core value prop (many agents at once). **Recommended** because it tells the AI.Pad story at a glance.

For final implementation: export each as `.ico` (Windows), `.icns` (macOS), and a 1024×1024 PNG. Sources are in `vanilla-ts/icons.ts`.
