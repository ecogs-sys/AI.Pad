import { _electron as electron, expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    args: [resolve(__dirname, '../../apps/desktop')],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const chrome = await electronApp.firstWindow();
  await expect(chrome.locator('#tab-strip .tab')).toHaveCount(1, { timeout: 8_000 });

  // One tab session at boot, no panes yet.
  await expect.poll(() => sessionCount(chrome), { timeout: 8_000 }).toBe(1);

  // Trigger the split via the application menu (electronApp.evaluate runs in main).
  await electronApp.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const tabs = menu?.items.find((m) => m.label === 'Tabs');
    const split = tabs?.submenu?.items.find((m) => m.label === 'Split Horizontally');
    split?.click();
  });

  // The split spawns one pane session — total becomes 2 — and the tab count is unchanged
  // (panes are not tabs).
  await expect.poll(() => sessionCount(chrome), { timeout: 8_000 }).toBe(2);
  await expect(chrome.locator('#tab-strip .tab')).toHaveCount(1);

  await electronApp.close();
});
