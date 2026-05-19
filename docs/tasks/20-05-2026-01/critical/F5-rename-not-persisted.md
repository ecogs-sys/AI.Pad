# F5 — Rename via sidebar context menu never persists

**Severity:** Critical
**Status:** Open

## Files
- `apps/desktop/src/renderer/chrome/layout-manager.ts:146-151` (`renameTab`)
- `apps/desktop/src/main/index.ts` (`tabMeta`, `persistTabs`)
- `packages/core/src/ipc-router.ts`
- `packages/contracts/src/ipc.ts`

## Problem
`renameTab` mutates the local `session.info.title` and re-renders. No IPC to main,
no `tabMeta` update, no `persistTabs()`. After restart or any `SessionList` re-query,
the original title returns.

## Impact
Tab rename is lost on restart — a promised Plan 3 feature silently does not stick.

## Fix approach
Add `core.session.set-title` IPC channel + `SessionSetTitlePayloadSchema`. Main:
update `Session._title` (use existing `Session.setTitle`), update `tabMeta`, call
`persistTabs()`. `Session.setTitle` already emits `titleChanged`, which
`IpcRouter` already broadcasts as `SessionTitleChanged` — chrome should listen to it
and update local state so all views stay in sync.

## Test plan
- Unit: `Session.setTitle` emits `titleChanged` with the new title (already
  implicitly covered; add explicit assertion).
- Manual: rename a tab, restart app, title persists.
