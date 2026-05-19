# F26 — keyboard.ts has comment-only no-op handlers

**Severity:** Low
**Status:** Open

## Files
- `apps/desktop/src/renderer/chrome/keyboard.ts:48-49`

## Problem
`ACTION_HANDLERS` has no-op entries for `splitHorizontal` / `splitVertical` (those
route via menu accelerators → `TerminalAction`). The `Record<BindingId, …>` type
forces an entry, so the no-ops exist purely to satisfy the type.

## Impact
Fragile: a future reader may think split shortcuts are unhandled.

## Fix approach
Either keep the no-ops with a clearer shared comment, or split the binding registry
into chrome-routed vs terminal-routed groups so the type no longer forces no-ops.
Low-risk: improve the comment and reference the menu route explicitly.

## Test plan
- `pnpm typecheck` clean.
