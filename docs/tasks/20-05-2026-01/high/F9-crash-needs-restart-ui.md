# F9 — Renderer-crash "Tab needs restart" state not surfaced

**Severity:** High
**Status:** Fixed (commit `fix(F8,F9)`)

## Files
- `apps/desktop/src/main/index.ts:207-238` (`handleRendererCrash`)
- `packages/contracts/src/ipc.ts`
- `apps/desktop/src/renderer/chrome/layout-manager.ts`

## Problem
Spec §7: *"If a view crashes twice in 60 s, stop auto-recovering — surface a 'Tab
needs restart' state."*

On the second crash within 60 s, `handleRendererCrash` only logs `console.warn` and
returns. The user sees a dead, empty pane with no instruction.

## Impact
A repeatedly-crashing tab becomes a silent dead zone.

## Fix approach
Add a `event.session.tab-broken` channel. When the crash limit is hit, broadcast it;
the chrome marks the tab broken and shows a "Tab crashed — Restart" affordance.
Restart recreates the view via the existing `createSessionView` path and clears the
crash counter.

## Test plan
- Unit (extractable): a crash-counter helper — 2 crashes < 60 s ⇒ "broken".
- Manual: force two renderer crashes; tab shows the broken state with Restart.
