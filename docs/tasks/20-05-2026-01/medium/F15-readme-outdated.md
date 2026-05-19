# F15 — README is significantly out of date

**Severity:** Medium
**Status:** Open

## Files
- `README.md`

## Problem
- "Top strip shows the label `Plan 1 — single fixed session`" — that label was
  removed in Plan 2.
- "`pnpm test` … 10 tests" — actual is ~39 unit + ~5 integration.
- The "Verify your install (Plan 1 manual smoke)" section reflects Plan 1 only.

## Impact
New contributors get wrong expectations; verification steps fail.

## Fix approach
Rewrite the verify/smoke section for the current multi-tab app; correct the test
counts; remove the Plan 1 label reference.

## Test plan
- Doc review only.
