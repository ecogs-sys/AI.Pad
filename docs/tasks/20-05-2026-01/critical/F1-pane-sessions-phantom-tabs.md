# F1 — Pane sessions create phantom tabs in the chrome

**Severity:** Critical
**Status:** Open

## Files
- `apps/desktop/src/renderer/chrome/layout-manager.ts:36-40`
- `packages/core/src/ipc-router.ts:144-147`
- `packages/core/src/session-manager.ts:27-44`

## Problem
`IpcRouter` broadcasts `event.session.created` for every `SessionManager.create()`
call. The chrome's `SessionCreated` handler unconditionally runs `upsertSession` +
`focus(info.id)`. Pane sessions created via `SessionCreateForPane`
(`SplitContainer.splitFocused`) therefore appear as phantom tabs in the tab strip
**and** steal focus.

Plan 3 §9 said pane creates must not trigger view/tab logic — only the *view* side
was protected (main has no `sessionCreated` view listener for panes), the *chrome*
side was missed.

## Impact
Splitting a pane adds a bogus tab and shifts focus to a tab with no view.

## Fix approach
Distinguish pane creates from tab creates. Add an optional `kind: 'tab' | 'pane'`
discriminator to the created-session flow:
- `SessionCreateForPanePayloadSchema` already separate — tag those sessions.
- Carry the kind on the `SessionInfo` (or emit a distinct event), so the chrome can
  ignore pane creates.

Chosen implementation: add `paneSessionIds: Set<SessionId>` tracking in the
`SessionManager` is wrong layer — instead emit the `kind` on the create event.
Simplest: `SessionManager.create(opts, kind?)` records `kind`; `SessionInfo` gains
`kind`. Chrome ignores `kind === 'pane'`.

## Test plan
- Unit: `SessionManager.create` with `kind: 'pane'` → `info().kind === 'pane'`.
- Existing AttentionDetector/SessionManager integration tests must still pass.
