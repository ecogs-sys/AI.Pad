# F17 — splits.spec.ts only asserts the app did not crash

**Severity:** Medium
**Status:** Open

## Files
- `tests/e2e/splits.spec.ts`

## Problem
The split E2E only triggers the menu action and checks the app stays alive. It does
not verify a second pane / session was actually created.

## Impact
A broken split path could pass CI.

## Fix approach
After triggering the split, assert via `electronApp.evaluate` (main context) or an
IPC `core.session.list` round-trip that the session count increased by one.

## Test plan
- The strengthened E2E test itself.
