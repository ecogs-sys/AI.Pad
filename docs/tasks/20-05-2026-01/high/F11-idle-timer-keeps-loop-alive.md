# F11 — AttentionDetector idle timer keeps the event loop alive

**Severity:** High
**Status:** Open

## Files
- `packages/core/src/attention-detector.ts:73-74`

## Problem
`this.idleTimer = setTimeout(() => this.checkIdle(), IDLE_MS)` has no `.unref()`.
A pending timer keeps the Node event loop alive. Any code that creates a detector,
processes a chunk, and does not otherwise drain leaves the process hanging until the
timer fires — relevant for tests and clean shutdown.

## Impact
Potential hangs in unit/integration tests and slower process exit.

## Fix approach
Call `this.idleTimer.unref?.()` immediately after `setTimeout`. Add a `dispose()`
that clears the timer, and call it from `Session` teardown.

## Test plan
- Unit: after `process()`, the detector's timer is `unref`'d (assert indirectly via
  a test that completes without a forced timeout).
- Unit: `dispose()` clears a pending idle timer (no `idle` emitted after dispose).
