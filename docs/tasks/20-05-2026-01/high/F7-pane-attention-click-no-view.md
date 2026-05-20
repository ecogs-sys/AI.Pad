# F7 — Pane attention notification click cannot focus the owning tab

**Severity:** High
**Status:** Fixed (commit `fix(F4,F7,F14,F21)`)

## Files
- `apps/desktop/src/main/notification-bridge.ts:39-49`
- `apps/desktop/src/main/index.ts`

## Problem
A BEL inside a pane triggers `sessionAttention` with the pane's session id.
`handleClick` calls `viewManager.show(paneSessionId)`, which silently no-ops because
panes have no `WebContentsView`. The notification click does nothing.

## Impact
Clicking a notification raised by a split pane does not bring the user to that tab.

## Fix approach
Depends on F3's `paneOwnership` map. In `handleClick`, resolve pane id → owning tab
id and `viewManager.show(tabId)` + send `LayoutShow` for the tab.

## Test plan
- Manual: BEL inside a split pane, window unfocused → notification → click focuses
  the owning tab.
