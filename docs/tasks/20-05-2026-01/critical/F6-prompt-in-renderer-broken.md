# F6 — window.prompt() in chrome renderer for rename is unreliable

**Severity:** Critical
**Status:** Open

## Files
- `apps/desktop/src/renderer/chrome/sidebar.ts:97-100`

## Problem
The sidebar rename context-menu item calls `window.prompt()`. Electron renderers
frequently disable `prompt()` (it logs `"prompt() is and will not be supported"`
and returns `null`). Rename then silently no-ops.

## Impact
Rename from the sidebar context menu does nothing for the user.

## Fix approach
Replace `prompt()` with an inline editable field, or reuse the modal-dialog pattern
from `new-session-dialog.ts`. Simplest: an inline `<input>` swapped into the sidebar
row on "Rename", committing on Enter / blur, cancelling on Escape.

## Test plan
- E2E or manual: rename via sidebar context menu actually changes the title.
- Tied to F5 (persistence) — verify combined.
