# F3 — Orphan-pane safety net kills all pane sessions when any tab closes

**Severity:** Critical
**Status:** Fixed (commit `fix(F3)`)

## Files
- `apps/desktop/src/main/index.ts:118-135`

## Problem
```ts
for (const info of sessionManager.list()) {
  if (!tabMeta.has(info.id) && !viewManager?.has(info.id)) {
    sessionManager.close(info.id);
  }
}
```
Pane sessions are deliberately absent from both `tabMeta` and `viewManager.views`.
So every `sessionExited` (e.g. the user closes one tab) closes **every pane in every
other tab**.

## Impact
Closing one tab silently kills the shells in all split panes across the app.

## Fix approach
Track pane→tab parentage explicitly. Add `paneOwnership: Map<paneSessionId, tabId>`
in main; main learns of new panes when the renderer calls `SessionCreateForPane`
(thread the owning tab id through that IPC payload). On a tab's `sessionExited`,
only close panes whose owner is that tab.

## Test plan
- Manual (controller): open 2 tabs, split tab A into 2 panes, close tab B → tab A's
  panes survive.
- Unit where extractable: a `paneOwnership` helper that, given a closing tab id,
  returns only that tab's panes.
