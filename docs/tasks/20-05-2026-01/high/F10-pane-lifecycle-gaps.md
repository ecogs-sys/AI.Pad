# F10 — Panes have no close UI, no Ctrl+W, no exit handling

**Severity:** High
**Status:** Open

## Files
- `apps/desktop/src/renderer/terminal/split-container.ts`
- `apps/desktop/src/renderer/chrome/keyboard.ts`

## Problem
- A pane's session can exit (user types `exit`); the pane DOM stays forever showing
  `[session exited]`.
- No way to close a single pane while keeping the tab open.
- `Ctrl+W` maps to `closeFocused`, which closes the whole tab, not the focused pane.

## Impact
Splits are effectively one-way: a pane, once created, cannot be removed.

## Fix approach
In `SplitContainer`:
- Add `closeFocusedPane()`: if the tree is a single leaf, do nothing (let the tab
  handle it); otherwise dispose the focused leaf's `TerminalHost`, send
  `core.session.close` for its session, collapse the branch (promote the sibling),
  and re-focus the sibling.
- Listen for `event.session.exited` for pane sessions and auto-collapse, or leave
  the exited pane visible until the user closes it (match tab behaviour from F8).
- Route a pane-close action via the `TerminalAction` event (`closePane`) so
  `Ctrl+W` inside a multi-pane tab closes the pane first.

## Test plan
- Manual: split a tab, close one pane → sibling fills the tab.
- E2E: split smoke remains green.
