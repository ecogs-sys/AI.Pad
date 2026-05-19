# F28 — SplitContainer divider drag listeners accumulate

**Severity:** Low
**Status:** Open

## Files
- `apps/desktop/src/renderer/terminal/split-container.ts:112-127` (`wireDivider`)

## Problem
`wireDivider` registers `mousemove` / `mouseup` listeners on `document` per divider.
After many splits these accumulate and are never removed.

## Impact
Minor memory growth; every `mousemove` runs all handlers.

## Fix approach
Register `mousemove` / `mouseup` on `document` once for the whole `SplitContainer`,
with a single "active divider" reference set on the divider's `mousedown`. Or scope
the move/up listeners to the drag lifetime (add on `mousedown`, remove on `mouseup`).

## Test plan
- Manual: split several times, drag dividers — no degradation.
