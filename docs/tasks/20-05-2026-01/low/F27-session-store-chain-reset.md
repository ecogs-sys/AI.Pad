# F27 — SessionStore writeChain silently resets on error

**Severity:** Low
**Status:** Fixed (commit `fix(F19,F27)`)

## Files
- `packages/core/src/session-store.ts:45-48`

## Problem
`save()` chains `.catch(() => {})`. A failed write is swallowed and the chain
continues; the failure is invisible. Closely related to F19.

## Impact
Same as F19 — silent persistence failure.

## Fix approach
Resolved together with F19: the `onError` hook makes the failure observable. Keep
the chain non-throwing so one bad write does not wedge later writes.

## Test plan
- Covered by F19's unit test.
