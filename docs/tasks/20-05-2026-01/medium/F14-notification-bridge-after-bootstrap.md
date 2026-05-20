# F14 — NotificationBridge wired after bootstrap; early attention events missed

**Severity:** Medium
**Status:** Fixed (commit `fix(F4,F7,F14,F21)`)

## Files
- `apps/desktop/src/main/index.ts:180-202`

## Problem
`bootstrapSessions()` (line 180) may create sessions that immediately produce output.
The `NotificationBridge` (line 197) is constructed after bootstrap, so any
`sessionAttention` emitted during restore is not seen by the bridge.

## Impact
Attention signals during app startup do not raise notifications.

## Fix approach
Resolved together with F4: construct the `NotificationBridge` at module scope,
before `app.whenReady()` / `createChromeWindow()` runs, so its `sessionAttention`
listener is registered before any session exists.

## Test plan
- Code review: bridge constructed before bootstrap.
