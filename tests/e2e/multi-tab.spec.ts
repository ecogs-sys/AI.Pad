import { _electron as electron, expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('opening a 2nd tab and triggering BEL badges the inactive tab', async () => {
  const electronApp = await electron.launch({
    args: [resolve(__dirname, '../../apps/desktop')],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const chrome = await electronApp.firstWindow();

  // Wait for the initial tab to appear (sessionList + sessionCreated should populate it).
  await expect(chrome.locator('#tab-strip .tab')).toHaveCount(1, { timeout: 8_000 });

  // Open a 2nd tab via the chrome's "+" button.
  await chrome.locator('#new-tab').click();
  // NewSessionDialog appears and must be visible (not covered by the terminal view).
  await expect(chrome.locator('#ns-open')).toBeVisible();
  await chrome.locator('#ns-open').click();
  await expect(chrome.locator('#tab-strip .tab')).toHaveCount(2, { timeout: 8_000 });

  // Click back to the first tab so the second is unfocused.
  const firstTabId = await chrome.locator('#tab-strip .tab').nth(0).getAttribute('data-session-id');
  const secondTabId = await chrome.locator('#tab-strip .tab').nth(1).getAttribute('data-session-id');
  expect(firstTabId).toBeTruthy();
  expect(secondTabId).toBeTruthy();
  await chrome.locator(`#tab-strip .tab[data-session-id="${firstTabId}"]`).click();

  // Write a BEL-producing command to the SECOND session via IPC.
  // PowerShell on Windows: `[char]7 | Write-Host -NoNewline\r`
  const bellCmd = process.platform === 'win32'
    ? '[char]7 | Write-Host -NoNewline\r'
    : `printf '\\a'\r`;
  await chrome.evaluate(async ({ id, cmd }) => {
    const aipad = (window as unknown as { aipad: { send: (c: string, p: unknown) => Promise<unknown> } }).aipad;
    const data = btoa(unescape(encodeURIComponent(cmd)));
    await aipad.send('core.session.write', { sessionId: id, data });
  }, { id: secondTabId!, cmd: bellCmd });

  // Wait for the attention dot to appear on the second tab.
  await expect(
    chrome.locator(`#tab-strip .tab[data-session-id="${secondTabId}"] .dot.attention`),
  ).toBeVisible({ timeout: 6_000 });

  await electronApp.close();
});
