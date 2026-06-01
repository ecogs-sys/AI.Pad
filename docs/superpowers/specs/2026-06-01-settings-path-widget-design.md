# Design: Settings Dialog — Rich Path Widget for Default Working Directory

**Date:** 2026-06-01
**Status:** Approved

---

## Summary

Replace the plain text input used for the Default Working Directory field in the Settings dialog with the same `aip-path-input` widget used in the New Session dialog. The widget shows a dim parent path + bold tail in display mode and a plain text input in edit mode. The New Session dialog is unchanged.

---

## Motivation

The Default Working Directory field was implemented with a simple `<input class="dlg-input">`. The New Session dialog has a richer path widget that makes long paths easier to read (dim parent, bold tail) and matches the visual language of the app. Applying the same widget to the settings field makes the experience consistent.

---

## Behaviour

### Field state at open

The field opens in **edit mode** (text input visible, unfocused). The detect-text field retains focus on open, same as today.

### Display / edit toggle

| Event | Resulting state |
|---|---|
| Blur on non-empty value | Display mode (dim parent + bold tail) |
| Blur on empty value | Stay in edit mode |
| Click field in display mode | Switch to edit mode, focus input |
| Browse returns a path | Edit mode, input updated |
| Browse cancelled or error | No change |

### Submit

- Trims `cwdValue` and includes it as `defaultCwd` in the returned `AppSettings`.
- No path validation — an invalid path is silently ignored at session-open time (the New Session dialog validates before spawning).
- Empty value is valid (means "use home directory").

### What does NOT change

- New Session dialog — untouched.
- All other settings fields — untouched.
- Help text "Leave blank to use your home directory." — preserved, displayed below the widget.
- Submit logic for `autoResume` — untouched.

---

## Architecture

### Files changed

| File | Change |
|---|---|
| `apps/desktop/src/renderer/chrome/settings-dialog.ts` | Replace `dlg-path-row` section with `aip-path-input` widget; add `splitPath`, `renderDisplay`, `renderEdit` helpers |
| `apps/desktop/src/renderer/chrome/settings-dialog.test.ts` | Update DOM queries to interact with the widget's nested `<input>` instead of a top-level `#set-default-cwd` input |

### HTML structure (Default Working Directory section)

```html
<section class="dlg-section">
  <div class="dlg-label">DEFAULT WORKING DIRECTORY</div>
  <div class="aip-path-input" id="set-default-cwd-wrap">
    <div class="aip-path-input__field" id="set-default-cwd-field"></div>
    <button class="aip-path-input__browse" id="set-default-cwd-browse" type="button">
      <span>🗁</span><span>Browse…</span>
    </button>
  </div>
  <div class="dlg-help">Leave blank to use your home directory.</div>
</section>
```

### Logic

**State:** `let cwdValue = current.defaultCwd` (simple variable, no object needed — the settings dialog has no error state for this field).

**Helpers copied from `new-session-dialog.ts`:**

```ts
function splitPath(p: string): { head: string; tail: string } {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  if (idx < 0) return { head: '', tail: p };
  return { head: p.slice(0, idx + 1), tail: p.slice(idx + 1) };
}

function renderDisplay(): void {
  const { head, tail } = splitPath(cwdValue);
  pathField.replaceChildren();
  if (head) {
    const dim = document.createElement('span');
    dim.className = 'dim';
    dim.textContent = head;
    pathField.appendChild(dim);
  }
  pathField.append(tail);
}

function renderEdit(opts: { focus: boolean; select?: boolean }): void {
  pathField.replaceChildren();
  const input = document.createElement('input');
  input.type = 'text';
  input.value = cwdValue;
  input.addEventListener('input', () => { cwdValue = input.value; });
  input.addEventListener('blur', () => {
    if (cwdValue.trim().length > 0) renderDisplay();
    // Stay in edit mode when empty.
  });
  pathField.appendChild(input);
  if (opts.focus) input.focus();
  if (opts.select) input.select();
}
```

**Click handler:** `pathField.addEventListener('click', (ev) => { if ((ev.target as HTMLElement).tagName !== 'INPUT') renderEdit({ focus: true }); });`

**Browse handler:** on success sets `cwdValue = r.path` then calls `renderEdit({ focus: false })`.

**Initial mount:** `renderEdit({ focus: false, select: cwdValue.length > 0 })`.

**Submit:** `const defaultCwd = cwdValue.trim();` — no validation gate.

### CSS

Uses `aip-path-input` / `aip-path-input__field` / `aip-path-input__browse` classes — the same classes as the New Session dialog, so existing stylesheet rules apply automatically with no CSS changes.

### Code approach

Copy `splitPath`, `renderDisplay`, `renderEdit` directly into `settings-dialog.ts`. Both files already duplicate the local `Bridge` interface; the same self-contained style is appropriate here. No shared module (YAGNI — two call sites).

---

## Testing

All 9 existing tests in `settings-dialog.test.ts` cover the same behaviours. Only the DOM query paths change:

- Queries that previously used `mount.querySelector<HTMLInputElement>('#set-default-cwd')` now query the nested `<input>` inside `#set-default-cwd-field` (e.g. `mount.querySelector<HTMLInputElement>('#set-default-cwd-field input')`).
- The Browse test already clicks `#set-default-cwd-browse` — the id is preserved on the button, so no change there.
- A new test verifies display mode: after blur on a non-empty value, the `.dim` span shows the parent path and the tail text is visible.

---

## Out of scope

- Shared path-input component.
- Path validation on settings save.
- Any changes to the New Session dialog.
- Any changes to other settings fields.
