import { app, BrowserWindow, WebContentsView, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { IpcRouter, SessionManager } from '@aipad/core';
import type { Shell } from '@aipad/contracts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;

const sessionManager = new SessionManager();
const ipcRouter = new IpcRouter(ipcMain, sessionManager);

let chromeWindow: BrowserWindow | null = null;
let terminalView: WebContentsView | null = null;

function defaultShell(): Shell {
  if (process.platform === 'win32') return 'pwsh';
  if (process.platform === 'darwin') return 'zsh';
  return 'bash';
}

function preloadPath(): string {
  // electron-vite emits preload to ../preload/index.js relative to main bundle.
  return join(__dirname, '../preload/index.js');
}

function rendererEntry(name: 'chrome' | 'terminal'): { url?: string; file?: string } {
  if (isDev) {
    const port = process.env['ELECTRON_RENDERER_URL'];
    if (!port) throw new Error('ELECTRON_RENDERER_URL is required in dev (set by electron-vite)');
    return { url: name === 'chrome' ? `${port}/index.html` : `${port}/terminal-host.html` };
  }
  return { file: join(__dirname, `../renderer/${name === 'chrome' ? 'index' : 'terminal-host'}.html`) };
}

async function loadInto(view: WebContentsView | BrowserWindow, entry: { url?: string; file?: string }): Promise<void> {
  if (entry.url) await view.webContents.loadURL(entry.url);
  else if (entry.file) await view.webContents.loadFile(entry.file);
}

async function createChromeWindow(): Promise<void> {
  chromeWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
    },
  });

  await loadInto(chromeWindow, rendererEntry('chrome'));
  ipcRouter.subscribe(chromeWindow.webContents);

  // Stage 1: one fixed session attached as a WebContentsView on top of the chrome window.
  terminalView = new WebContentsView({
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
    },
  });
  chromeWindow.contentView.addChildView(terminalView);
  ipcRouter.subscribe(terminalView.webContents);

  // Position the view under the title bar / fake tab bar (30px). Resize tracks the window.
  const layout = (): void => {
    if (!chromeWindow || !terminalView) return;
    const { width, height } = chromeWindow.getContentBounds();
    terminalView.setBounds({ x: 0, y: 30, width, height: Math.max(0, height - 30) });
  };
  layout();
  chromeWindow.on('resize', layout);

  // Create the one fixed session *before* loading the renderer, so we can pass its id as a
  // query parameter — no IPC handshake or race window.
  const session = sessionManager.create({
    shell: defaultShell(),
    cwd: homedir(),
    cols: 80,
    rows: 24,
  });

  const entry = rendererEntry('terminal');
  if (entry.url) {
    await terminalView.webContents.loadURL(`${entry.url}?sessionId=${encodeURIComponent(session.id)}`);
  } else if (entry.file) {
    await terminalView.webContents.loadFile(entry.file, {
      query: { sessionId: session.id },
    });
  }
}

app.whenReady().then(async () => {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  await createChromeWindow();
});

app.on('before-quit', async (event) => {
  if (sessionManager.list().length === 0) return;
  event.preventDefault();
  await sessionManager.closeAll();
  app.exit(0);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
