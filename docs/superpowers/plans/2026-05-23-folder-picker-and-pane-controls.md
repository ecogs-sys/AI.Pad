# Folder Picker & Pane Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native folder-browser button to the New Tab dialog, and give split panes a right-click context menu plus reliable keyboard shortcuts.

**Architecture:** A new `DialogPickDirectory` IPC request lets the chrome renderer ask the main process to open Electron's native folder picker. The New Tab dialog gets a folder-icon button wired to it through an injected callback. The terminal renderer's `SplitContainer` gains a self-contained DOM context menu (it already owns the split tree, so no extra IPC). Split shortcuts are remapped in the shared `keymap` package.

**Tech Stack:** TypeScript, Electron 33, Zod (IPC payload schemas), Playwright (e2e). pnpm workspace monorepo.

**Conventions:**
- Commit messages: Conventional Commits, with a trailing `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` line.
- Branch: `feat/folder-picker-and-split-cwd` (already created and checked out).
- The desktop app has **no unit-test harness** — only Playwright e2e (`tests/e2e/`) plus `pnpm typecheck` / `pnpm build`. This plan verifies accordingly. The `apps/desktop` build (`NODE_ENV=production`) is required before any e2e run because the spec launches the built `out/` bundle.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `packages/contracts/src/ipc.ts` | IPC channel names + Zod payload schemas | Add `DialogPickDirectory` channel + payload schema |
| `apps/desktop/src/main/index.ts` | Main-process IPC handlers | Add `DialogPickDirectory` handler (native folder dialog) |
| `apps/desktop/src/renderer/chrome/new-session-dialog.ts` | New Tab modal UI (DOM only) | Add folder-icon button + `pickDirectory` option |
| `apps/desktop/src/renderer/chrome/layout-manager.ts` | Chrome orchestration | Provide the `pickDirectory` callback (does the IPC send) |
| `apps/desktop/index.html` | Chrome renderer markup + CSS | CSS for the input-row + icon button |
| `packages/keymap/src/index.ts` | Shared keybinding registry | Remap `splitHorizontal` / `splitVertical` accelerators |
| `apps/desktop/src/renderer/terminal/split-container.ts` | Split-pane tree + UI | Add right-click context menu (split / close pane) |
| `apps/desktop/terminal-host.html` | Terminal renderer markup + CSS | CSS for the context menu |
| `tests/e2e/folder-picker.spec.ts` | e2e | New spec — folder button fills the input |
| `tests/e2e/splits.spec.ts` | e2e | Add vertical-split / close-pane / accelerator tests |

---

## Task 1: Add the `DialogPickDirectory` IPC contract

**Files:**
- Modify: `packages/contracts/src/ipc.ts`

- [ ] **Step 1: Add the channel name**

In `packages/contracts/src/ipc.ts`, inside the `IpcChannel` object, in the `// Requests (renderer -> main)` group, add the new channel after the `ResumeCancel` line (line 33):

```ts
  ResumeCancel: 'core.resume.cancel',
  DialogPickDirectory: 'core.dialog.pick-directory',
```

- [ ] **Step 2: Add the request payload schema**

In the same file, in the `// --- Request payloads ---` section, after the `SessionCreateForPanePayloadSchema` block (ends line 115), add:

```ts
/** Renderer asks main to open a native folder picker. `defaultPath` is the directory
 * the picker opens at; an empty string means the OS default. The handler resolves with
 * the chosen absolute path, or null when the user cancels. */
export const DialogPickDirectoryPayloadSchema = z.object({
  defaultPath: z.string().default(''),
});

export type DialogPickDirectoryResult = string | null;
```

- [ ] **Step 3: Verify the package type-checks**

Run: `pnpm typecheck`
Expected: PASS — no errors. (`@aipad/core` re-exports `IpcChannel` from contracts, so the new key flows through automatically.)

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/ipc.ts
git commit -m "$(cat <<'EOF'
feat(contracts): add DialogPickDirectory IPC channel

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Main-process handler for the native folder picker

**Files:**
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: Import `dialog` and the new schema**

In `apps/desktop/src/main/index.ts`, change the Electron import on line 1 to include `dialog`:

```ts
import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron';
```

Change the `@aipad/contracts` import on line 7 to include the new schema:

```ts
import { AppSettingsSchema, ResumeCancelPayloadSchema, DialogPickDirectoryPayloadSchema } from '@aipad/contracts';
```

- [ ] **Step 2: Register the handler**

In the same file, immediately after the `LayoutDefaultCwd` handler (line 134, `ipcMain.handle(IpcChannel.LayoutDefaultCwd, ...)`), add:

```ts
// IPC: renderer asks main to open the OS-native folder picker. Returns the chosen
// absolute path, or null if cancelled. Parented to the chrome window when available.
ipcMain.handle(IpcChannel.DialogPickDirectory, async (_e, raw): Promise<string | null> => {
  const parsed = DialogPickDirectoryPayloadSchema.safeParse(raw ?? {});
  const defaultPath = parsed.success ? parsed.data.defaultPath : '';
  const options: Electron.OpenDialogOptions = { properties: ['openDirectory'] };
  if (defaultPath) options.defaultPath = defaultPath;
  const result = chromeWindow
    ? await dialog.showOpenDialog(chromeWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]!;
});
```

- [ ] **Step 3: Verify type-check**

Run: `pnpm typecheck`
Expected: PASS — no errors.

- [ ] **Step 4: Verify the build succeeds**

Run: `pnpm build`
Expected: PASS — `apps/desktop` builds without errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/index.ts
git commit -m "$(cat <<'EOF'
feat(desktop): handle DialogPickDirectory with native folder dialog

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Folder-picker button in the New Tab dialog

**Files:**
- Create: `tests/e2e/folder-picker.spec.ts`
- Modify: `apps/desktop/src/renderer/chrome/new-session-dialog.ts`
- Modify: `apps/desktop/src/renderer/chrome/layout-manager.ts`
- Modify: `apps/desktop/index.html`

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/folder-picker.spec.ts`:

```ts
import { _electron as electron, expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Launch args with an isolated, empty userData dir so persisted tabs from a previous
 * run cannot leak in. */
function launchArgs(): string[] {
  const userData = mkdtempSync(join(tmpdir(), 'aipad-e2e-'));
  return [resolve(__dirname, '../../apps/desktop'), `--user-data-dir=${userData}`];
}

test('New Tab dialog folder button fills the working-directory input', async () => {
  const electronApp = await electron.launch({
    args: launchArgs(),
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const chrome = await electronApp.firstWindow();
  await expect(chrome.locator('#tab-strip .tab')).toHaveCount(1, { timeout: 8_000 });

  // Stub the folder-picker IPC handler in main so no real native dialog opens.
  const fakePath = process.platform === 'win32' ? 'C:\\aipad-e2e-folder' : '/tmp/aipad-e2e-folder';
  await electronApp.evaluate(({ ipcMain }, picked) => {
    ipcMain.removeHandler('core.dialog.pick-directory');
    ipcMain.handle('core.dialog.pick-directory', () => picked);
  }, fakePath);

  // Open the New Tab dialog and click the folder-browse button.
  await chrome.click('#new-tab');
  await expect(chrome.locator('#ns-browse')).toBeVisible({ timeout: 8_000 });
  await chrome.click('#ns-browse');

  // The stubbed handler resolves and the input is filled with the chosen path.
  await expect(chrome.locator('#ns-cwd')).toHaveValue(fakePath, { timeout: 8_000 });

  await electronApp.close();
});
```

- [ ] **Step 2: Build, then run the test to verify it fails**

Run: `pnpm build && pnpm --filter @aipad/e2e exec playwright test folder-picker.spec.ts`
Expected: FAIL — `#ns-browse` never becomes visible (the button does not exist yet).

- [ ] **Step 3: Add the folder button + `pickDirectory` option to the dialog**

In `apps/desktop/src/renderer/chrome/new-session-dialog.ts`, extend the `NewSessionDialogOptions` interface (currently lines 8-11):

```ts
export interface NewSessionDialogOptions {
  defaultShell: Shell;
  defaultCwd: string;
  /** Opens a native folder picker and resolves with the chosen path, or null if the
   * user cancelled. When omitted, the browse button is hidden. */
  pickDirectory?: () => Promise<string | null>;
}
```

In `showNewSessionDialog`, replace the working-directory label + input lines in the `root.innerHTML` template (currently lines 38-39):

```ts
      <label for="ns-cwd">Working directory</label>
      <input id="ns-cwd" type="text" />
```

with an input row containing the input and an icon button:

```ts
      <label for="ns-cwd">Working directory</label>
      <div class="input-row">
        <input id="ns-cwd" type="text" />
        <button id="ns-browse" type="button" class="icon-btn" title="Browse for folder…" aria-label="Browse for folder">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        </button>
      </div>
```

After the existing `const cancelEl = root.querySelector...` line (line 50), add a query for the browse button:

```ts
    const browseEl = root.querySelector<HTMLButtonElement>('#ns-browse')!;
```

After the `cwdEl.select();` line (line 55), add the browse-button wiring:

```ts
    if (opts.pickDirectory) {
      browseEl.addEventListener('click', () => {
        void (async () => {
          const picked = await opts.pickDirectory!();
          if (picked) {
            cwdEl.value = picked;
            cwdEl.focus();
          }
        })();
      });
    } else {
      browseEl.style.display = 'none';
    }
```

- [ ] **Step 4: Provide the `pickDirectory` callback from LayoutManager**

In `apps/desktop/src/renderer/chrome/layout-manager.ts`, inside `openNewTabDialog()`, change the `showNewSessionDialog` call (currently lines 172-175) to pass the callback:

```ts
      result = await showNewSessionDialog(mount, {
        defaultShell: this.platformDefaultShell(),
        defaultCwd: this.platformDefaultCwd(),
        pickDirectory: () => this.pickDirectory(),
      });
```

Add this private method immediately after `openNewTabDialog()` (after its closing brace, before `platformDefaultShell()`):

```ts
  /** Open the native folder picker, seeded with the directory currently typed into the
   * New Tab dialog. Returns the chosen path, or null if cancelled. */
  private async pickDirectory(): Promise<string | null> {
    const cwdInput = document.getElementById('ns-cwd') as HTMLInputElement | null;
    const defaultPath = cwdInput?.value.trim() ?? '';
    const picked = await this.bridge.send(IpcChannel.DialogPickDirectory, { defaultPath });
    return typeof picked === 'string' ? picked : null;
  }
```

`IpcChannel` is already imported in this file (line 2: `import { IpcChannel } from '@aipad/contracts';`) — no import change needed.

- [ ] **Step 5: Add the CSS for the input row + icon button**

In `apps/desktop/index.html`, inside the `<style>` block, immediately after the `.dialog button.primary:hover { ... }` line (line 76), add:

```css
      .dialog .input-row { display: flex; gap: 6px; }
      .dialog .input-row input { flex: 1; }
      .dialog button.icon-btn { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; padding: 0 10px; }
```

- [ ] **Step 6: Build, then run the test to verify it passes**

Run: `pnpm build && pnpm --filter @aipad/e2e exec playwright test folder-picker.spec.ts`
Expected: PASS — the input is filled with the stubbed path.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/renderer/chrome/new-session-dialog.ts apps/desktop/src/renderer/chrome/layout-manager.ts apps/desktop/index.html tests/e2e/folder-picker.spec.ts
git commit -m "$(cat <<'EOF'
feat(desktop): add folder-browser button to New Tab dialog

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Remap the split keyboard shortcuts

**Files:**
- Modify: `tests/e2e/splits.spec.ts`
- Modify: `packages/keymap/src/index.ts`

The split/close menu items already route correctly to the terminal view; the original
shortcuts failed only because `Ctrl+\` is a flaky accelerator. This task adds e2e
coverage for the routing (a regression guard, expected to pass immediately) and an
accelerator assertion (expected to fail until the keymap is remapped).

- [ ] **Step 1: Add the new e2e tests**

In `tests/e2e/splits.spec.ts`, append these two tests after the existing test (after line 58):

```ts
test('split vertically then close the pane via the menu', async () => {
  const electronApp = await electron.launch({
    args: launchArgs(),
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const chrome = await electronApp.firstWindow();
  await expect(chrome.locator('#tab-strip .tab')).toHaveCount(1, { timeout: 8_000 });
  await expect.poll(() => sessionCount(chrome), { timeout: 8_000 }).toBe(1);

  // Let the terminal renderer mount its SplitContainer + TerminalAction listener.
  await chrome.waitForTimeout(2_500);

  const clickMenu = (label: string): Promise<void> =>
    electronApp.evaluate(({ Menu }, lbl) => {
      const menu = Menu.getApplicationMenu();
      const tabs = menu?.items.find((m) => m.label === 'Tabs');
      const item = tabs?.submenu?.items.find((m) => m.label === lbl);
      item?.click();
    }, label);

  // Split → a pane session is added (total 2).
  await clickMenu('Split Vertically');
  await expect.poll(() => sessionCount(chrome), { timeout: 8_000 }).toBe(2);

  // Close Pane → the pane session is removed (total back to 1).
  await clickMenu('Close Pane');
  await expect.poll(() => sessionCount(chrome), { timeout: 8_000 }).toBe(1);
  await expect(chrome.locator('#tab-strip .tab')).toHaveCount(1);

  await electronApp.close();
});

test('split menu items expose the remapped accelerators', async () => {
  const electronApp = await electron.launch({
    args: launchArgs(),
    env: { ...process.env, NODE_ENV: 'production' },
  });
  await electronApp.firstWindow();

  const accelerators = await electronApp.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const tabs = menu?.items.find((m) => m.label === 'Tabs');
    const find = (lbl: string): string | undefined =>
      tabs?.submenu?.items.find((m) => m.label === lbl)?.accelerator;
    return { horizontal: find('Split Horizontally'), vertical: find('Split Vertically') };
  });

  expect(accelerators.horizontal).toBe('Alt+Shift+=');
  expect(accelerators.vertical).toBe('Alt+Shift+-');

  await electronApp.close();
});
```

- [ ] **Step 2: Build, then run the spec to confirm the split state**

Run: `pnpm build && pnpm --filter @aipad/e2e exec playwright test splits.spec.ts`
Expected:
- `split menu action creates a new pane session` — PASS (existing test).
- `split vertically then close the pane via the menu` — PASS (routing already works; this is the regression guard).
- `split menu items expose the remapped accelerators` — FAIL (accelerators are still `CmdOrCtrl+\` / `CmdOrCtrl+Shift+\`).

- [ ] **Step 3: Remap the accelerators in the keymap package**

In `packages/keymap/src/index.ts`, update the header comment's third line (line 3) from:

```ts
 * Plan 3 will add split shortcuts (Ctrl+\, Ctrl+Shift+\).
```

to:

```ts
 * Plan 3 adds split shortcuts (Alt+Shift+=, Alt+Shift+-, Ctrl+Shift+W).
```

Then replace the `splitHorizontal` and `splitVertical` lines (lines 27-28) with:

```ts
  splitHorizontal: { id: 'splitHorizontal', description: 'Split horizontally', accelerator: 'Alt+Shift+=' },
  splitVertical:   { id: 'splitVertical',   description: 'Split vertically',   accelerator: 'Alt+Shift+-' },
```

Leave the `closePane` line (line 29, `CmdOrCtrl+Shift+W`) unchanged.

Mapping rationale (from the spec): `Alt+Shift+=` produces a left/right (side-by-side) split — the app's `splitHorizontal`; `Alt+Shift+-` produces a top/bottom (stacked) split — the app's `splitVertical`. `=` and `-` are valid Electron accelerator key codes. No change is needed in `keyboard.ts` or `app-menu.ts`: both read accelerators from this registry, and the split actions are already menu-routed (their `keyboard.ts` handlers are intentional no-ops).

- [ ] **Step 4: Build, then run the spec to verify all tests pass**

Run: `pnpm build && pnpm --filter @aipad/e2e exec playwright test splits.spec.ts`
Expected: PASS — all three tests pass, including the accelerator assertion.

- [ ] **Step 5: Commit**

```bash
git add packages/keymap/src/index.ts tests/e2e/splits.spec.ts
git commit -m "$(cat <<'EOF'
feat(keymap): remap split shortcuts to Alt+Shift+= / Alt+Shift+-

The previous Ctrl+\ / Ctrl+Shift+\ bindings were unreliable — backslash is
a flaky Electron accelerator and a terminal control character.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Pane right-click context menu

**Files:**
- Modify: `apps/desktop/src/renderer/terminal/split-container.ts`
- Modify: `apps/desktop/terminal-host.html`

The context menu lives in the terminal renderer's `WebContentsView`, which the
Playwright harness cannot drive directly (see `splits.spec.ts` — it works through the
app menu and IPC counts instead). This task is verified by `pnpm typecheck` + `pnpm
build` plus the manual procedure in Step 4. The underlying `splitFocused` /
`closeFocusedPane` calls the menu invokes are already covered by `splits.spec.ts`.

- [ ] **Step 1: Add the context-menu state, wiring, and methods to `SplitContainer`**

In `apps/desktop/src/renderer/terminal/split-container.ts`:

**1a.** After the `private focused: LeafNode;` field declaration (line 35), add two fields:

```ts
  private focused: LeafNode;
  private contextMenuEl: HTMLElement | null = null;
  private menuCleanup: (() => void) | null = null;
```

**1b.** In the constructor, replace the `focusin` listener block (lines 55-58):

```ts
    leafEl.addEventListener('focusin', () => {
      // Walk the tree to find the leaf with this DOM element — keeps focus tracking correct after splits.
      this.focused = this.findLeafByElement(leafEl) ?? this.focused;
    });
```

with a single call:

```ts
    this.wirePaneEvents(leafEl);
```

**1c.** In `splitFocused`, replace the `newLeafEl.addEventListener('focusin', ...)` block (lines 112-114):

```ts
    newLeafEl.addEventListener('focusin', () => {
      this.focused = this.findLeafByElement(newLeafEl) ?? this.focused;
    });
```

with:

```ts
    this.wirePaneEvents(newLeafEl);
```

**1d.** Add the `wirePaneEvents` helper and the two context-menu methods. Insert them immediately after the `closeFocusedPane()` method (after its closing brace, line 168), before `findParent`:

```ts
  /** Wire focus tracking and the right-click context menu for a pane element. */
  private wirePaneEvents(el: HTMLElement): void {
    el.addEventListener('focusin', () => {
      // Walk the tree to find the leaf with this DOM element — keeps focus tracking correct after splits.
      this.focused = this.findLeafByElement(el) ?? this.focused;
    });
    el.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      // Right-clicking a pane focuses it, so split/close act on that pane.
      this.focused = this.findLeafByElement(el) ?? this.focused;
      this.openContextMenu(ev.clientX, ev.clientY);
    });
  }

  /** Render the pane context menu at the given viewport coordinates. */
  private openContextMenu(x: number, y: number): void {
    this.closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'pane-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const addItem = (label: string, run: () => void, disabled: boolean): void => {
      const item = document.createElement('div');
      item.className = disabled ? 'pane-menu-item disabled' : 'pane-menu-item';
      item.textContent = label;
      if (!disabled) {
        item.addEventListener('click', () => {
          this.closeContextMenu();
          run();
        });
      }
      menu.appendChild(item);
    };

    // Close Pane is unavailable for a single-pane tab — tab-level close (Ctrl+W) handles that.
    const singlePane = this.root.kind === 'leaf';
    addItem('Split Horizontally', () => void this.splitFocused('horizontal'), false);
    addItem('Split Vertically', () => void this.splitFocused('vertical'), false);
    addItem('Close Pane', () => this.closeFocusedPane(), singlePane);

    document.body.appendChild(menu);
    this.contextMenuEl = menu;

    // Keep the menu inside the viewport when opened near an edge.
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${Math.max(0, window.innerWidth - rect.width)}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${Math.max(0, window.innerHeight - rect.height)}px`;

    const onDocMouseDown = (ev: MouseEvent): void => {
      if (!menu.contains(ev.target as Node)) this.closeContextMenu();
    };
    const onDocKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') this.closeContextMenu();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onDocKey);
    this.menuCleanup = (): void => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onDocKey);
    };
  }

  /** Remove the context menu and its document listeners, if open. */
  private closeContextMenu(): void {
    this.menuCleanup?.();
    this.menuCleanup = null;
    this.contextMenuEl?.remove();
    this.contextMenuEl = null;
  }
```

- [ ] **Step 2: Add the context-menu CSS**

In `apps/desktop/terminal-host.html`, inside the `<style>` block, after the `#term-root { ... }` line (line 9), add:

```css
      .pane-menu { position: fixed; z-index: 1000; min-width: 168px; padding: 4px 0; background: #252526; border: 1px solid #454545; border-radius: 4px; box-shadow: 0 4px 16px rgba(0,0,0,0.5); font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; color: #d4d4d4; }
      .pane-menu-item { padding: 5px 14px; cursor: pointer; white-space: nowrap; }
      .pane-menu-item:hover { background: #094771; }
      .pane-menu-item.disabled { color: #6b6b6b; cursor: default; }
      .pane-menu-item.disabled:hover { background: transparent; }
```

- [ ] **Step 3: Verify type-check and build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS — no errors.

- [ ] **Step 4: Manual verification**

Run `pnpm dev`, then:

1. **Single pane:** Right-click inside the terminal. A context menu appears with **Split Horizontally**, **Split Vertically**, and a greyed-out **Close Pane**.
2. **Split:** Click **Split Horizontally**. The pane splits left/right into two terminals.
3. **Close Pane enabled:** Right-click either pane. **Close Pane** is now enabled (not greyed).
4. **Close:** Click **Close Pane**. The right-clicked pane closes and its sibling fills the space.
5. **Dismiss:** Open the menu again; press `Escape` — it closes. Open it again; click elsewhere in the terminal — it closes.
6. **Vertical:** Right-click → **Split Vertically** splits the pane top/bottom.
7. **Edge clamp:** Right-click near the bottom-right corner — the menu stays fully on-screen.

All seven behaviors should hold. If any fails, fix before committing.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/terminal/split-container.ts apps/desktop/terminal-host.html
git commit -m "$(cat <<'EOF'
feat(desktop): add right-click context menu to split panes

Right-clicking a pane opens a menu to split horizontally/vertically or
close the pane, giving panes a discoverable on-screen control.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Final Verification

- [ ] **Run the full check suite**

```bash
pnpm typecheck && pnpm build && pnpm --filter @aipad/e2e test
```

Expected: type-check passes, build succeeds, and all e2e specs pass (`smoke`, `multi-tab`, `settings`, `splits`, `folder-picker`).

- [ ] **Confirm the branch is clean and ready**

```bash
git status --short
git log --oneline main..HEAD
```

Expected: clean working tree; five feature commits (Tasks 1-5) plus the design/plan doc commits on `feat/folder-picker-and-split-cwd`.

---

## Notes & Risks

- **`dialog.showOpenDialog` parent window:** the handler parents the dialog to `chromeWindow` when it exists. The terminal `WebContentsView` is already suspended while the New Tab modal is open (`LayoutModal`), so the native picker layers cleanly.
- **Right-click paste:** the context menu takes over right-click inside a pane, so right-click paste is no longer available. Paste remains on xterm's default (`Ctrl+Shift+V` / selection). This trade-off was accepted during design review.
- **Context-menu e2e gap:** the menu cannot be driven by Playwright (terminal `WebContentsView` is not an inspectable page). It is covered by typecheck/build + the manual procedure; the split/close logic it calls is covered by `splits.spec.ts`.
- **`splitHorizontal` / `splitVertical` naming:** the binding IDs keep their existing names even though `splitHorizontal` produces a side-by-side layout. Renaming was explicitly out of scope (see spec Non-Goals).
