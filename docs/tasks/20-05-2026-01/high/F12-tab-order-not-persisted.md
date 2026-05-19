# F12 — Tab reorder is not persisted across restarts

**Severity:** High
**Status:** Open

## Files
- `packages/contracts/src/persistence.ts`
- `apps/desktop/src/main/index.ts` (`snapshotTabs`, `tabMeta`)
- `apps/desktop/src/renderer/chrome/layout-manager.ts` (`reorderTab`)
- `packages/contracts/src/ipc.ts`
- `packages/core/src/ipc-router.ts`

## Problem
`PersistedTabs` has no explicit order field; `snapshotTabs()` serialises
`tabMeta.values()` (creation order). `LayoutManager.reorderTab` mutates only the
renderer-local `tabOrder`; main is never told. Plan 3 §13 promised "order persists
across restart" — it does not.

## Impact
Drag-reordering tabs is forgotten on the next launch.

## Fix approach
Add `core.layout.reorder-tabs` IPC carrying the full ordered `sessionId[]`. Main
keeps an authoritative `tabOrder: string[]`; `snapshotTabs()` emits tabs in that
order. `LayoutManager.reorderTab` sends the new order after every reorder.

`bootstrapSessions` already restores tabs in array order, so restoring the persisted
order needs no extra work once the array is written in order.

## Test plan
- Unit: `SessionStore` round-trip with a reordered `tabs` array preserves order
  (existing round-trip test already covers array order).
- Manual: reorder tabs, restart, order preserved.
