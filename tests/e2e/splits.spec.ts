import { _electron as electron, expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Launch args with an isolated, empty userData dir so persisted tabs from a previous
 * run (or another spec) cannot leak in. */
function launchArgs(): string[] {
  const userData = mkdtempSync(join(tmpdir(), 'aipad-e2e-'));
  return [resolve(__dirname, '../../apps/desktop'), `--user-data-dir=${userData}`];
}

/** Query the total session count (tabs + panes) via the chrome IPC bridge. */
async function sessionCount(chrome: import('@playwright/test').Page): Promise<number> {
  return chrome.evaluate(async () => {
    const aipad = (window as unknown as {
      aipad: { send: (c: string, p?: unknown) => Promise<unknown> };
    }).aipad;
    const list = (await aipad.send('core.session.list')) as unknown[];
    return list.length;
  });
}

test('split menu action creates a new pane session', async () => {
  const electronApp = await electron.launch({
    args: launchArgs(),
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const chrome = await electronApp.firstWindow();
  await expect(chrome.locator('#tab-strip .tab')).toHaveCount(1, { timeout: 8_000 });

  // One tab session at boot, no panes yet.
  await expect.poll(() => sessionCount(chrome), { timeout: 8_000 }).toBe(1);

  // Give the terminal view's renderer time to mount its SplitContainer and register
  // the TerminalAction listener before the menu action is dispatched to it.
  await chrome.waitForTimeout(2_500);

  // Trigger the split via the application menu (electronApp.evaluate runs in main).
  const triggerSplit = (): Promise<void> =>
    electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      const tabs = menu?.items.find((m) => m.label === 'Tabs');
      const split = tabs?.submenu?.items.find((m) => m.label === 'Split Horizontally');
      split?.click();
    });
  await triggerSplit();

  // The split spawns one pane session — total becomes 2 — and the tab count is unchanged
  // (panes are not tabs).
  await expect.poll(() => sessionCount(chrome), { timeout: 8_000 }).toBe(2);
  await expect(chrome.locator('#tab-strip .tab')).toHaveCount(1);

  await electronApp.close();
});

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
