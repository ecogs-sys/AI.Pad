# F2 — NewSessionDialog is hidden by the terminal WebContentsView overlay

**Severity:** Critical
**Status:** Fixed (commit `fix(F2)`)

## Files
- `apps/desktop/index.html` (`#dialog-mount`)
- `apps/desktop/src/main/view-manager.ts:130-143`
- `apps/desktop/src/renderer/chrome/layout-manager.ts:84-101`

## Problem
The dialog mount is a DOM element inside the chrome page. The terminal
`WebContentsView` is a **native overlay above the chrome DOM**, positioned at
`{x: sidebarPx, y: TAB_BAR_PX, …}`. The dialog is centered, so most of it (including
the Open button) is covered by the terminal view. Only the L-shape of sidebar + tab
strip shows the dialog.

## Impact
The shell/cwd picker (Plan 3 core feature) is largely invisible and unusable.

## Fix approach
While the dialog is open, hide the active terminal view (move it offscreen via
`setBounds 0,0,0,0`); restore it on close. Add IPC `core.layout.set-overlay`
(boolean) or reuse a dedicated channel; main calls `viewManager.suspend()` /
`viewManager.resume()`.

## Test plan
- E2E (multi-tab.spec): after clicking `+`, assert `#ns-open` is visible and
  clickable (it already clicks it; add a visibility assertion).
- Unit: `ViewManager.suspend()` hides the current view; `resume()` re-applies bounds.
