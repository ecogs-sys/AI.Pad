# F25 — Unused / redundant imports in main

**Severity:** Low
**Status:** Open

## Files
- `apps/desktop/src/main/index.ts:1-11`

## Problem
Several imported symbols are only partially used; `IpcChannel` is re-exported from
`@aipad/core` purely for main's convenience. Minor clutter.

## Impact
Cosmetic; ESLint `no-unused-vars` may or may not flag depending on usage.

## Fix approach
Run a pass with `pnpm lint` / `tsc` and drop genuinely unused imports. Re-verify
after the critical/high fixes (which add imports) so this is done last.

## Test plan
- `pnpm lint` / `pnpm typecheck` clean.
