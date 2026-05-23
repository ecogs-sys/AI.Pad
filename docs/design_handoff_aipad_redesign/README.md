# Handoff: AI.Pad Redesign

Visual + interaction spec for the AI.Pad Electron app — a multi-session terminal built around AI coding agents (Claude Code, Codex CLI, etc.). This package replaces the current UI with a refined dark, mono-forward chrome and adds a couple of small UX additions for the multi-agent workflow.

---

## About the design files

The files under `design/` in this bundle are **design references created in HTML/React-on-the-fly**. They are prototypes showing intended look and behavior — **not production code to copy directly**.

Your task: **recreate these designs inside the existing AI.Pad Electron renderer**, using whatever framework, styling, and module patterns the codebase already uses (React + plain CSS, styled-components, Tailwind, etc.). If the renderer doesn't have a UI framework yet, React + plain CSS variables (matching `design/tokens.css`) is the cleanest path because the spec is already expressed that way.

Open `AI.Pad Redesign (standalone).html` (in the root of this folder) in any browser by double-clicking it — that's a single self-contained file with everything inlined, works offline, no server needed. The version under `design/` is the source-split prototype (HTML + separate JSX files) — useful if you want to read the components but it requires a local web server to render (e.g. `npx serve` from the `design/` folder).

## Fidelity

**High-fidelity.** All colors, type sizes, spacing, and radii in this spec are final. Use the exact values in `tokens.css` as your source of truth.

---

## Tech notes for an Electron renderer

A few things in this design require Electron-specific wiring; everything else is normal renderer work.

1. **Custom titlebar.** Set `frame: false` (Win/Linux) or `titleBarStyle: 'hidden'` (macOS) on the `BrowserWindow`. Mark the titlebar container with `-webkit-app-region: drag` and the menu items + window-control buttons with `-webkit-app-region: no-drag`. On macOS, leave 80px of left-side padding for the traffic-light overlay (don't render your own controls there). On Windows/Linux, render the three controls shown in the design on the right.
2. **Window controls.** Wire min / max / close to `window.minimize() / window.maximize()` (or `unmaximize` when already maximized) / `window.close()` over IPC. Use `BrowserWindow.on('maximize'|'unmaximize')` to swap the maximize-icon glyph.
3. **Menu bar.** AI.Pad currently uses native menus. The custom titlebar inlines `File / Tabs / View / Window / Help` next to the app icon. Build these as a custom dropdown menu component or fall through to `electron.Menu.buildFromTemplate(...).popup()` triggered from each menu button.
4. **Native notifications.** Replace the current bottom-right toast with the existing `new Notification(...)` path. Title format: `electron.app.Electron · pwsh.exe needs you` is fine; we are not redesigning that surface in this round.
5. **Persisted state.** Status colors, working directories, time-in-state all come from your existing session-tracking layer — the redesign is purely a render change.

---

## Screens

There are six artboards on the canvas, in two groups:

### 1. Main · single session
**Purpose:** baseline state with one active session.
**Layout:** titlebar (32px) → tab bar (36px) → body row of `[sidebar 260px] [terminal pane fill]`.
**Notable:** sidebar shows the status-overview header (4 cells: await / limited / running / idle) above the single session row.

### 2. Multi-session · attention sort
**Purpose:** the headline state — the user has 4 sessions and one is awaiting input.
**Layout:** same as Main; sidebar shows 4 session rows.
**Sort order:** sessions are listed with *awaiting* first, then *limited*, then *running*, then *idle* — this is the "attention sort" — so the row that needs the user always floats to the top.
**Tab bar:** 4 tabs, the awaiting one has a soft glow ring on its status dot (see *Status colors* below).

### 3. Split panes
**Purpose:** two terminals side-by-side inside one tab.
**Layout:** identical chrome; the terminal pane is split into two equal columns with a 1px `var(--border-2)` divider. Each pane has a small uppercase mono label in the top-left (`top: 8px; left: 12px; padding: 2px 6px; background: var(--term-bg); border-radius: 3px; font: 10px/1 mono; color: var(--text-4)`).

### 4. Empty state · onboarding
**Purpose:** first launch / no sessions.
**Layout:** titlebar only (no tab bar) → centered 540px content stack: app icon + wordmark, 2 quick-start cards (`New session` accented, `Resume`), then a list of recent projects.
**Recents row format:** `[18px PS chip] [name mono 12.5px] [cwd mono 11px, var(--text-4), flex:1] [when mono 10.5px, var(--text-4)]`.

### 5. Settings · Auto-resume modal
**Purpose:** preferences. Currently scoped to the auto-resume feature.
**Layout:** dimmed scrim (`var(--bg-overlay)` + `backdrop-filter: blur(2px)`) over the multi-session screen; modal is 560px wide, centered with 120px top padding, `border-radius: 10px`, `box-shadow: 0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)`.
**Sections (top → bottom):** header strip with "Settings · Auto-resume" breadcrumb + close × · toggle row with description · text-to-detect input (focused, with accent ring + 3 quick-add chips) · response-to-send input · footer with rule count and Cancel / Save buttons.

### 6. Command palette · ⌘K (new)
**Purpose:** quick switcher / action launcher.
**Layout:** same scrim over the multi screen; modal is 620px wide, max 520px tall, `border-radius: 12px`.
**Top:** `⌘K` glyph + search query (with blinking accent caret) + esc hint chip.
**Body:** three sections — `SWITCH TO SESSION`, `START SESSION`, `ACTIONS`. Each item row: `[22px kind chip] [title 13px / meta mono 10.5px] [optional status pill] [shortcut chip]`. Active row is highlighted with `var(--bg-3)` + 2px left border in accent.
**Bottom:** keyboard-hint strip + result count.
**Open with Ctrl+K (Windows/Linux) / ⌘K (macOS), close with Esc.**

---

## Component spec

All sizes are in CSS pixels at 1× scale.

### TitleBar — 32px tall
- Background: `var(--bg-1)`, bottom: `1px solid var(--border-1)`.
- Row layout (left → right): `[16px AppGlyph at 10/12px padding] [menu items, 12.5px Inter, 8px h-padding each, var(--text-2)] [flex spacer with centered title — "AI.Pad" 12px var(--text-2) weight 500, subtitle "— pwsh.exe" 12px var(--text-4) with 10px left margin] [WindowControls]`.
- WindowControls: three 46×32px hit zones, color `var(--text-2)`, SVG icons (minimize `M0 5h10`, maximize `0.5 0.5 9 9` stroked rect, close X). On hover: background `var(--bg-3)`, close button hover background `oklch(0.55 0.18 25)`.

### TabBar — 36px tall
- Background: `var(--bg-1)`, bottom: `1px solid var(--border-1)`.
- Each tab: 160-220px width, `padding: 0 14px`, JetBrains Mono 12px, right border `1px solid var(--border-1)`.
- Active tab: background flips to `var(--bg-0)` (matches the terminal pane below — visually "pulls" the tab forward) and a 2px accent stripe sits along the top edge.
- Layout inside tab: `[7px status dot] [label, flex:1, ellipsis] [14px × close]`.
- Awaiting-state tabs get a soft glow ring on the dot: `box-shadow: 0 0 0 3px oklch(0.82 0.13 88 / 0.50)`.
- After the last tab: a 36×36 `+` button.

### Sidebar — 260px wide
- Background: `var(--bg-1)`, right: `1px solid var(--border-1)`. Flex column.
- **Header (40px):** `SESSIONS` label (mono 10.5px, uppercase, letter-spacing 1.2px, weight 600, `var(--text-3)`) on the left; on the right two ghost icon buttons (sort `⇅` and new `+`, 22×22, `var(--text-4)`).
- **Status overview strip (sticky under header):** background `var(--bg-1)`, bottom border. 4 equal cells with vertical dividers (`1px solid var(--border-1)` between cells, not on the last). Each cell: 8px top padding, 10px h-padding, gap 4px. Top row: 5px status-color dot + count (mono 16px, weight 600, tabular-nums, `var(--text-1)` if count > 0 else `var(--text-4)`). Bottom row: tiny label (mono 9.5px, uppercase, letter-spacing 0.4px, `var(--text-4)`) — `await / limited / running / idle`.
- **Session row** (described below).
- **Footer (32px):** top border, mono 10.5px, `var(--text-4)`. Left: `⌘K  palette`. Right: `N active`.

### Session row
- Padding: `12px 14px 12px 16px`. Active row gets `background: var(--bg-3)` + a 2px accent left border (transparent border on inactive rows so width stays stable).
- Top line: `[22px kind chip + small status corner-dot] [name, mono 12.5px, ellipsis]`.
  - Kind chip: 22×22, `border-radius: 5px`, `background: var(--bg-3)`, `border: 1px solid var(--border-2)`, mono 9px weight 600 letter-spacing 0.4px `var(--text-2)`. Shows shell prefix (`PS` for PowerShell, `BSH` for bash, `ZSH`, etc.).
  - Status corner dot: 8px circle absolutely positioned `top: -3px; right: -3px` on the kind chip, `border: 2px solid var(--bg-1)` so it punches a hole. Only rendered when status ≠ `idle`.
- Middle line: working directory, mono 10.5px `var(--text-4)`, ellipsis, indented 32px (past the chip).
- Bottom line: `<StatusBadge status=... time=... style="pill" />`, indented 32px.

### StatusBadge — 3 styles (pickable in Tweaks panel)
All use mono. Default is **pill**.

| Style | Visual |
| --- | --- |
| `pill` | Rounded 999 chip, `padding: 2px 8px`, `font: 10.5px mono`, `background: var(--st-{status}-bg)`, color: `var(--st-{status})`. Inner: 5px dot + label + `· {time}` in `var(--text-3)`. |
| `dot` | 7px outlined dot (3px ring at `var(--st-{status}-ring)`) + label + `  ·  {time}` in mono 11px `var(--text-3)`. |
| `icon` | Status glyph in the status color (`▶ running`, `◔ awaiting`, `◼ limited`, `○ idle`) + label + time. |

### Terminal pane
- Background: `var(--term-bg)`. Default padding 18px, right-pad +4 for scrollbar.
- Lines render at JetBrains Mono 12.5px, line-height 1.6.
- Colors used (ANSI-ish, our cool palette): `--term-fg`, `--term-dim`, `--term-green`, `--term-cyan`, `--term-yellow`, `--term-blue`, `--term-magenta`, `--term-red`.
- AI agent blocks get a 2px left border in `--term-magenta` and a `▎` glyph prefix per line.
- Tool-call lines start with `⏵` in `--term-cyan` and an optional dimmed result trailing after two spaces.
- Custom scrollbar: 4px wide track at `right: 4px`, thumb `var(--bg-4)` `border-radius: 2px`.
- Blinking cursor: 8px wide × 1em tall block at `var(--term-fg)`, 1.05s steps(1) infinite opacity blink.

### Modal scrim
- `position: fixed; inset: 0; background: var(--bg-overlay); backdrop-filter: blur(2px); z-index: 10`.
- Children flex top-aligned with 120px `padding-top`.

---

## Interactions & behavior

| Surface | Trigger | Behavior |
| --- | --- | --- |
| Tab | Click | Activate tab; pane swaps with no transition. |
| Tab | Middle-click or `×` | Close tab with confirm if status is `running` or `awaiting`. |
| Tab `+` | Click | Opens a small menu: New Claude / Codex / pwsh / bash. |
| Session row | Click | Activate that tab (rows mirror tabs 1:1). |
| Session row | Right-click | Context menu: Rename, Duplicate, Move to new window, Close. |
| Status overview cell | Click | Filter sidebar to that status; click again to clear. |
| Command palette | `Ctrl/⌘ K` | Open palette. `↑↓` navigates, `↵` opens, `Esc` closes, `Tab` filters by section. |
| Settings input chips | Click | Replace the input value with the chip's text. |
| Auto-resume toggle | Click | Persist via existing settings store. |
| Awaiting tab dot | Auto | Soft pulse animation (1.4s ease-in-out, scale 1 → 1.08 → 1, opacity 1 → 0.6 → 1) is acceptable polish but optional. |
| Window drag | Titlebar | Native drag via `-webkit-app-region: drag`. |

### Sort behaviour for sidebar / tabs

Sidebar rows are sorted by status priority, then by time-in-state descending (oldest first within a status). Tabs **do not** auto-resort — they keep user order — but sidebar can resort live. Tab order is the canonical user-controlled order; sidebar is a status-aware view of the same data.

```
priority = { awaiting: 0, limited: 1, running: 2, idle: 3 }
```

---

## Design tokens

See `design/tokens.css` for a paste-ready CSS file. Summary:

### Colors (oklch)

| Token | Value | Use |
| --- | --- | --- |
| `--bg-0` | `oklch(0.155 0.008 250)` | Terminal pane / deepest surface |
| `--bg-1` | `oklch(0.195 0.008 250)` | Sidebar, titlebar, tab bar |
| `--bg-2` | `oklch(0.235 0.008 250)` | Modal background |
| `--bg-3` | `oklch(0.275 0.009 250)` | Active row / hover surface |
| `--bg-4` | `oklch(0.325 0.010 250)` | Scrollbar thumb, soft chip backgrounds |
| `--bg-overlay` | `oklch(0.10 0.008 250 / 0.7)` | Modal scrim |
| `--text-1` | `oklch(0.97 0.003 250)` | Primary text |
| `--text-2` | `oklch(0.74 0.006 250)` | Secondary text |
| `--text-3` | `oklch(0.56 0.008 250)` | Tertiary / labels |
| `--text-4` | `oklch(0.42 0.008 250)` | Muted / hints |
| `--border-1` | `oklch(0.30 0.010 250 / 0.6)` | Subtle dividers |
| `--border-2` | `oklch(0.36 0.012 250 / 0.5)` | Stronger borders, input outlines |
| `--accent` | `#7CA8E0` (dusty blue) | Brand / selected |
| `--accent-soft` | accent + `2e` alpha | Focus rings |
| `--st-running` | `oklch(0.78 0.15 155)` | Sage green |
| `--st-running-bg` | `… / 0.14` | Pill background |
| `--st-awaiting` | `oklch(0.82 0.13 88)` | Warm amber |
| `--st-awaiting-bg` | `… / 0.16` |   |
| `--st-limited` | `oklch(0.70 0.18 25)` | Soft red |
| `--st-limited-bg` | `… / 0.16` |   |
| `--st-idle` | `oklch(0.55 0.008 250)` | Neutral |
| `--st-idle-bg` | `… / 0.14` |   |
| `--term-bg` | `oklch(0.165 0.008 250)` | Terminal background |
| `--term-fg` | `oklch(0.92 0.004 250)` | Default fg |
| `--term-dim` | `oklch(0.62 0.006 250)` | Muted terminal text |
| `--term-green` | `oklch(0.82 0.16 145)` |   |
| `--term-cyan` | `oklch(0.80 0.12 200)` |   |
| `--term-yellow` | `oklch(0.86 0.14 92)` |   |
| `--term-blue` | `oklch(0.78 0.13 240)` |   |
| `--term-magenta` | `oklch(0.74 0.14 320)` |   |
| `--term-red` | `oklch(0.72 0.16 25)` |   |

### Type

| Family | Use |
| --- | --- |
| `Inter` 400/500/600/700 | UI chrome — menus, buttons, modal headers, body text |
| `JetBrains Mono` 400/500/600/700 | Everything code-adjacent — tab labels, session names, CWDs, status badges, terminal |

Both available via Google Fonts; the renderer bundle should pre-load them locally for offline launches.

Type ramp (px):
- 10 / 10.5 (uppercase mono labels, hints)
- 11 / 11.5 (meta, footer)
- 12 / 12.5 (chrome, tab labels, primary mono content)
- 13 / 13.5 (modal body)
- 14 (buttons, modal labels)
- 16 (status overview counts)
- 24 (wordmark in empty state)

### Spacing & radii

| Token | Value |
| --- | --- |
| Tab height | 36px |
| Titlebar height | 32px |
| Sidebar width | 260px |
| Modal radii | 10px (settings) / 12px (palette) |
| Card / input radii | 6-8px |
| Chip radii | 4-5px |
| Pill radii | 999px |

---

## State model (sketch)

```ts
type Status = 'running' | 'awaiting' | 'limited' | 'idle';

interface Session {
  id: string;
  kind: 'PS' | 'BSH' | 'ZSH' | 'CMD' | string; // shown in 22x22 chip
  name: string;           // user-editable, defaults to `${binary}`
  cwd: string;            // tildified for display
  binary: string;         // e.g. 'pwsh.exe', 'claude', 'codex'
  status: Status;
  statusSince: number;    // ms timestamp; UI derives `time` ("10s", "1m 14s", "47m")
  awaitingPromptText?: string; // last detected prompt, for tooltips
  rateLimit?: { resetsAt: number };
}

interface AutoResumeRule {
  id: string;
  detectText: string;
  responseText: string;
  enabled: boolean;
}

interface AppState {
  sessions: Session[];
  activeSessionId: string;
  tabOrder: string[];     // canonical user-controlled order
  paletteOpen: boolean;
  settingsOpen: 'auto-resume' | null;
  splitMap: Record<string, string[]>; // tabId → array of session ids in that tab
}
```

`time` formatter:
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

Three directions are in `design/AI.Pad Redesign.html` under the "App icon" section. The current shipping icon (three muted dots + `>_` cursor on a rounded square) is closest to **Direction A**. Our recommendation is **Direction C — stacked sessions**, because it visualizes the product's core proposition (many agents at once). Direction B (the notepad) plays nicely with the "Pad" half of the name and is the safest mid-ground.

For final implementation: export each as `.ico` (Windows), `.icns` (macOS), and a 1024×1024 PNG. Sources are SVG in `design/icons.jsx` if you want to refactor.

---

## Files in this handoff

```
design_handoff_aipad_redesign/
├── README.md                          ← this file
├── AI.Pad Redesign (standalone).html  ← ★ double-click to view the prototype offline
└── design/
    ├── AI.Pad Redesign.html           ← same prototype, source-split (needs `npx serve`)
    ├── tokens.css                     ← paste-ready CSS variables
    ├── app.jsx                        ← chrome components (TitleBar, TabBar, Sidebar, StatusBadge, …)
    ├── screens.jsx                    ← TerminalPane, modals, EmptyState
    ├── main.jsx                       ← screen compositions + canvas wiring (reference only)
    ├── icons.jsx                      ← 3 icon SVG sources
    ├── design-canvas.jsx              ← prototype-only; ignore for production
    └── tweaks-panel.jsx               ← prototype-only; ignore for production
```

When implementing: read `tokens.css` first, then `app.jsx` for chrome and `screens.jsx` for terminal/modals. The shape of those components (props, children) is a recommendation; adapt to whatever your renderer already does.
