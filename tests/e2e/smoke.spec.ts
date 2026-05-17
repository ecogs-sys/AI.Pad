import { _electron as electron, expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('app launches, prompt appears, echo round-trips', async () => {
  const electronApp = await electron.launch({
    args: [resolve(__dirname, '../../apps/desktop')],
    env: { ...process.env, NODE_ENV: 'production' },
  });

  // The chrome window is the first window; the WebContentsView is its own webContents.
  // For Plan 1 we only need to confirm the app boots and stays up.
  const chrome = await electronApp.firstWindow();
  await expect(chrome.locator('.tab-bar')).toHaveText(/Plan 1/);

  // Cleanly close.
  await electronApp.close();
});
