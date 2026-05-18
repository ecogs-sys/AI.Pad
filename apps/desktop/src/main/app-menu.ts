import { Menu, type MenuItemConstructorOptions, BrowserWindow } from 'electron';
import { Bindings } from '@aipad/keymap';
import { IpcChannel } from '@aipad/contracts';

function send(action: string, chromeWindow: () => BrowserWindow | null): void {
  const win = chromeWindow();
  win?.webContents.send(IpcChannel.ActionInvoke, { action });
}

/**
 * Build the application menu. Accelerators on menu items fire OS-globally when the app is
 * focused, regardless of which WebContentsView (chrome vs. terminal) currently has keyboard
 * focus. This is the only way to make Ctrl+T / Ctrl+W / Ctrl+Tab / etc. work without
 * requiring the user to click on the chrome bar first.
 */
export function buildAppMenu(chromeWindow: () => BrowserWindow | null): Menu {
  const tabsSubmenu: MenuItemConstructorOptions[] = [
    { label: 'New Tab',      accelerator: Bindings.newTab.accelerator,   click: () => send('newTab', chromeWindow) },
    { label: 'Close Tab',    accelerator: Bindings.closeTab.accelerator, click: () => send('closeTab', chromeWindow) },
    { type: 'separator' },
    { label: 'Next Tab',     accelerator: Bindings.nextTab.accelerator,  click: () => send('nextTab', chromeWindow) },
    { label: 'Previous Tab', accelerator: Bindings.prevTab.accelerator,  click: () => send('prevTab', chromeWindow) },
    { type: 'separator' },
    ...Array.from({ length: 9 }, (_, i) => {
      const id = `jumpTab${i + 1}` as 'jumpTab1';
      return {
        label: `Tab ${i + 1}`,
        accelerator: Bindings[id].accelerator,
        click: () => send(id, chromeWindow),
      };
    }),
  ];

  const viewSubmenu: MenuItemConstructorOptions[] = [
    { label: 'Toggle Sidebar', accelerator: Bindings.toggleSidebar.accelerator, click: () => send('toggleSidebar', chromeWindow) },
    { type: 'separator' },
    { role: 'reload' },
    { role: 'toggleDevTools' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];

  return Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'Tabs', submenu: tabsSubmenu },
    { label: 'View', submenu: viewSubmenu },
  ]);
}
