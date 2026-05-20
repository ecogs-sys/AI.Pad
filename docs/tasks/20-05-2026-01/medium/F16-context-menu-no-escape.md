# F16 — Sidebar context menu has no Escape dismiss

**Severity:** Medium
**Status:** Fixed (commit `fix(F5,F6,F16)`)

## Files
- `apps/desktop/src/renderer/chrome/sidebar.ts:82-108`

## Problem
The sidebar right-click context menu dismisses only on outside `mousedown`. There is
no `Escape`-key dismiss and no dismiss on window blur.

## Impact
Minor UX wart — the menu can linger.

## Fix approach
Add a `keydown` listener for `Escape` that removes the menu; clean up both listeners
together.

## Test plan
- Manual: open the context menu, press Escape → menu closes.
