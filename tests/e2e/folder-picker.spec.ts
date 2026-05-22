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
