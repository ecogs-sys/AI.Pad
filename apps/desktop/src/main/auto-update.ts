import { app } from 'electron';

/**
 * Wire auto-update against GitHub Releases. Quiet behavior: check on startup, download in
 * background, prompt user only when an update is ready to install.
 *
 * electron-updater is lazy-imported so that its module-load side-effects (network probes,
 * native-addon loads, etc.) never execute in the unpackaged dev / Playwright context.
 */
export async function setupAutoUpdate(): Promise<void> {
  if (!app.isPackaged) return; // skip in dev / Playwright
  const { autoUpdater } = await import('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => console.warn('[auto-update] error:', err));
  autoUpdater.on('update-available', (info) => console.info('[auto-update] available:', info.version));
  autoUpdater.on('update-downloaded', () => console.info('[auto-update] downloaded; will install on quit'));

  void autoUpdater.checkForUpdates();
}
