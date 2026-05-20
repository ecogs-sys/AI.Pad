# F4 — NotificationBridge leaks listeners on macOS window reopen

**Severity:** Critical
**Status:** Fixed (commit `fix(F4,F7,F14,F21)`)

## Files
- `apps/desktop/src/main/index.ts:149-205` (`createChromeWindow`)
- `apps/desktop/src/main/notification-bridge.ts`

## Problem
`new NotificationBridge(...)` is created inside `createChromeWindow()`. On macOS the
user can close the chrome window and reopen it via the dock (`app.on('activate')`).
Each reopen builds a new bridge that registers another `sessionAttention` listener
on `sessionManager`. Listeners accumulate → duplicate OS notifications, unbounded
growth. No `dispose()`.

## Impact
Duplicate notifications after every window reopen on macOS; listener leak.

## Fix approach
Construct the `NotificationBridge` once at module scope (it only needs lazy getters
for `chromeWindow` / `viewManager` / `focusedSessionId`, which it already has). Move
the `new NotificationBridge(...)` out of `createChromeWindow` to module init.

## Test plan
- Code review: bridge constructed exactly once.
- Optional: assert `sessionManager.listenerCount('sessionAttention')` stays constant
  across simulated window recreation.
