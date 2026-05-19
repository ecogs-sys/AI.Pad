# F8 — Exited tab is destroyed; spec requires a read-only exited state

**Severity:** High
**Status:** Open

## Files
- `apps/desktop/src/main/index.ts:118-135` (`sessionExited` listener)
- `apps/desktop/src/renderer/chrome/layout-manager.ts`
- `apps/desktop/src/renderer/chrome/tab-strip.ts`

## Problem
Spec §7: *"PTY mid-life exit: tab stays as a read-only `exited` state with shell
exit code in status bar and a manual Restart button. No auto-restart."*

The implementation destroys the `WebContentsView` and removes `tabMeta` immediately
on `sessionExited`. This is a deliberate divergence (a code comment notes it) but it
conflicts with the approved spec.

## Impact
Exited sessions vanish; the user cannot read final scrollback or restart in place.

## Fix approach
On `sessionExited`: keep the view alive (do not `destroy`). The terminal already
prints `[session exited, code=N]`. Tab strip already renders the grey `.dot.exited`.
Add a "Restart" affordance (tab-strip context option or button) that re-creates a
session with the same shell/cwd in that tab.

The view is destroyed only on explicit tab **close**. Move `viewManager.destroy` +
`tabMeta.delete` + `persistTabs` into the `core.session.close` path instead of the
`sessionExited` path.

Note: the pane-orphan cleanup (F3) moves to the close path too.

## Test plan
- Manual: run `exit` in a tab → tab remains with grey dot + "Restart"; Restart spawns
  a fresh shell.
- E2E: existing smoke/multi-tab must still pass.
