# F19 — SessionStore save errors are silently swallowed

**Severity:** Medium
**Status:** Open

## Files
- `packages/core/src/session-store.ts:45-48`

## Problem
`save()` does `this.writeChain.then(...).catch(() => {})`. Disk-full / permission /
lock failures are invisible. Spec §7: "non-blocking status-bar warning ('Layout not
saved: …')".

## Impact
Silent loss of persistence; the user is never told layout was not saved.

## Fix approach
Give `SessionStore` an `onError(cb)` hook (or surface the rejection). Keep `save()`
non-throwing for callers, but invoke the callback with the error. Main wires the
callback to a console warning at minimum (status-bar UI is a later enhancement, but
the hook unblocks it).

## Test plan
- Unit: a `SessionStore` pointed at an unwritable dir invokes `onError`.
