# Folder Picker & Pane Controls — Design

**Date:** 2026-05-23
**Branch:** `feat/folder-picker-and-split-cwd`
**Status:** Approved

## Problem

Two usability gaps in the desktop app:

1. **New Tab dialog requires typing the working directory.** Users must type a full
   folder path by hand; there is no way to browse for it.
2. **Split panes feel un-closable, and split shortcuts do not work.** Once a pane is
   split there is no on-screen control to close it — only the `Ctrl+Shift+W` shortcut
   or the **Tabs → Close Pane** menu. The split shortcuts (`Ctrl+\`, `Ctrl+Shift+\`)
   are unreliable: backslash is a flaky Electron accelerator and also a terminal
   control character.

## Goals

- Add a native folder-browser button to the New Tab dialog's working-directory field.
- Give panes an on-screen, discoverable way to split and close: a right-click context menu.
- Replace the flaky split shortcuts with reliable key combinations.

## Non-Goals

- Changing how a pane's `cwd` is resolved on split — it already correctly inherits the
  tab's configured directory. No change needed.
- Renaming the `splitHorizontal` / `splitVertical` binding IDs or menu labels.
- Persisting split layouts (out of scope).

---

## Feature 1 — Folder picker in the New Tab dialog

### Behavior

The **Working directory** field in the New Tab dialog gets a folder-icon button beside
it. Clicking it opens the OS-native folder picker. If the user selects a folder, the
input is filled with that path; if they cancel, the input is unchanged. The picker
opens at the path currently in the input (so it starts where the user was already
pointing).

### Implementation

- **IPC contract** — add a request/response channel `DialogPickDirectory` to
  `packages/contracts/src/ipc.ts`. Request payload: `{ defaultPath: string }`.
  Response: the selected absolute path (`string`) or `null` when cancelled.
- **Main process** (`apps/desktop/src/main/index.ts`) — handle `DialogPickDirectory`
  by calling
  `dialog.showOpenDialog(chromeWindow, { properties: ['openDirectory'], defaultPath })`
  and returning `result.canceled ? null : result.filePaths[0]`.
- **Dialog UI** (`renderer/chrome/new-session-dialog.ts`) — add a folder-icon button
  next to the `#ns-cwd` input. The dialog stays UI-only: `NewSessionDialogOptions`
  gains an optional `pickDirectory: () => Promise<string | null>` callback. On click,
  the dialog awaits the callback and, if a path is returned, sets `cwdEl.value`.
- **Wiring** (`renderer/chrome/layout-manager.ts`) — `openNewTabDialog()` passes a
  `pickDirectory` callback that runs the `DialogPickDirectory` IPC `send` with the
  input's current value as `defaultPath`.
- **Styling** — a small icon button styled to sit inline with the text input; uses an
  inline SVG folder glyph so it themes with the dialog.

### Rationale

Injecting a `pickDirectory` callback (rather than handing the dialog the preload
`bridge`) keeps `new-session-dialog.ts` free of IPC concerns and independently
testable, consistent with its current structure. The terminal `WebContentsView` is
already suspended while this modal is open, so the native picker layers cleanly.

---

## Feature 2 — Pane right-click menu & shortcut remap

### Right-click context menu

Right-clicking anywhere inside a pane opens a small context menu with:

- **Split Horizontally** — new pane side-by-side (left/right).
- **Split Vertically** — new pane stacked (top/bottom).
- **Close Pane** — closes the focused pane; hidden/disabled when the tab has only one pane.

The menu is a DOM element rendered by `split-container.ts`:

- `split-container.ts` already owns the full split tree, so it knows the pane count
  and the focused pane with no extra IPC. The menu items call `splitFocused(...)` and
  `closeFocusedPane()` directly.
- A `contextmenu` listener on each pane element calls `preventDefault()` and renders
  an absolutely-positioned menu at the cursor. The menu closes on selection, on
  outside click, and on `Escape`.
- **Close Pane** is omitted when `this.root.kind === 'leaf'` (single-pane tab) — that
  case is handled by tab-level close (`Ctrl+W`).

**Trade-off:** right-click is taken over by this menu, so right-click paste is no
longer available; paste remains on `Ctrl+Shift+V` and xterm text selection. This was
accepted during design review.

### Rationale (DOM menu vs. native menu)

A DOM menu inside `split-container.ts` is preferred over an Electron native
`Menu.popup()` because the split tree (pane count, focused pane) lives in the
renderer. A native menu would require round-tripping that state to the main process
on every right-click. Trade-off: the menu is styled by us rather than OS-native.

### Shortcut remap

The split shortcuts are redefined in `packages/keymap/src/index.ts`. They are mapped
by *resulting layout* (Windows-Terminal style):

| Keys          | Result                          | Binding ID        |
|---------------|---------------------------------|-------------------|
| `Alt+Shift+=` | Split left/right (side-by-side) | `splitHorizontal` |
| `Alt+Shift+-` | Split top/bottom (stacked)      | `splitVertical`   |
| `Ctrl+Shift+W`| Close focused pane              | `closePane` (unchanged) |

- Accelerators are defined once in `keymap`; `main/app-menu.ts` and
  `renderer/chrome/keyboard.ts` read them automatically — no other change needed in
  those files.
- The implementation verifies the menu → terminal-view routing fires end-to-end (the
  app-menu accelerator sends `IpcChannel.TerminalAction` to the focused terminal view,
  which `renderer/terminal/main.ts` handles). This routing is the other suspect for
  "shortcuts not working" and is covered by an e2e check.

---

## Files Touched

| File | Change |
|------|--------|
| `packages/contracts/src/ipc.ts` | New `DialogPickDirectory` channel + payload types |
| `apps/desktop/src/main/index.ts` | `DialogPickDirectory` handler using `dialog.showOpenDialog` |
| `apps/desktop/src/renderer/chrome/new-session-dialog.ts` | Folder-icon button + `pickDirectory` option |
| `apps/desktop/src/renderer/chrome/layout-manager.ts` | Pass `pickDirectory` callback into the dialog |
| `apps/desktop/src/renderer/terminal/split-container.ts` | Right-click context menu (split / close pane) |
| `packages/keymap/src/index.ts` | Remap `splitHorizontal` / `splitVertical` accelerators |
| CSS (chrome dialog + terminal renderer) | Folder-button and context-menu styling |

## Testing

- **Unit / component:** New Tab dialog renders the folder button and updates the input
  when `pickDirectory` resolves a path; leaves it unchanged on `null`.
- **Split container:** context menu shows the correct items; **Close Pane** absent for
  a single-pane tab; menu actions invoke `splitFocused` / `closeFocusedPane`.
- **E2e:** open the New Tab dialog and confirm the folder button is present; split a
  pane, close it via the context menu, and confirm the remapped shortcuts trigger a
  split.
