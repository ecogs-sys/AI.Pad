# F23 — IPC event fan-out sends every session's data to every view

**Severity:** Medium
**Status:** Fixed (commit `fix(F23)`)

## Files
- `packages/core/src/ipc-router.ts:144-174` (`broadcast`)

## Problem
`broadcast` sends every `event.session.*` (including high-volume
`event.session.data`) to every subscribed `webContents` — the chrome plus every
terminal view. Terminal hosts filter by `sessionId`, but the IPC traffic is O(N²) in
the number of tabs.

## Impact
Wasted IPC/serialization with many tabs; acceptable for Stage 1 but worth bounding.

## Fix approach
Route `event.session.data` only to the `webContents` that owns that session. Add a
`subscribeFor(sessionId, wc)` registration so data events target one view; keep
broadcast for chrome-level events (created/exited/attention/title).

## Test plan
- Integration: existing `SessionManager`/router behaviour unchanged; data still
  reaches the correct terminal.
- Unit on the routing map if extracted.
