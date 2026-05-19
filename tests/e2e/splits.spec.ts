import { _electron as electron, expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('split menu action does not crash the app', async () => {
  const electronApp = await electron.launch({
    args: [resolve(__dirname, '../../apps/desktop')],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const chrome = await electronApp.firstWindow();
  await expect(chrome.locator('#tab-strip .tab')).toHaveCount(1, { timeout: 8_000 });

  // Trigger the split via the application menu (electronApp.evaluate runs in main).
  await electronApp.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const tabs = menu?.items.find((m) => m.label === 'Tabs');
    const split = tabs?.submenu?.items.find((m) => m.label === 'Split Horizontally');
    split?.click();
  });

  // Wait a moment for the IPC + renderer split to happen.
  await chrome.waitForTimeout(2_000);

  // App is still alive.
  await expect(chrome.locator('#tab-strip .tab')).toHaveCount(1);

  await electronApp.close();
});
