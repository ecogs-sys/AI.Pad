import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { IpcChannel, IpcRouter, SessionManager, SessionStore } from '@aipad/core';
import type { Shell, SessionInfo } from '@aipad/contracts';
import { ViewManager } from './view-manager.js';
import { NotificationBridge } from './notification-bridge.js';
import { buildAppMenu } from './app-menu.js';
import { bootstrapSessions } from './session-bootstrap.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged && process.env['NODE_ENV'] !== 'production';

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const sessionManager = new SessionManager();
const ipcRouter = new IpcRouter(ipcMain, sessionManager);
const sessionStore = new SessionStore(app.getPath('userData'));
const tabMeta = new Map<string, { tabId: string; shell: Shell; cwd: string; title?: string }>();

function snapshotTabs(): {
  version: 1;
  tabs: Array<{ tabId: string; shell: Shell; cwd: string; title?: string }>;
  focusedTabId: string | null;
} {
  return {
    version: 1,
    tabs: Array.from(tabMeta.values()),
    focusedTabId: focusedSessionId,
  };
}

function persistTabs(): void {
  void sessionStore.save(snapshotTabs());
}

let chromeWindow: BrowserWindow | null = null;
let viewManager: ViewManager | null = null;

function defaultShell(): Shell {
  if (process.platform === 'win32') return 'pwsh';
  if (process.platform === 'darwin') return 'zsh';
  return 'bash';
}

function preloadPath(): string {
  return join(__dirname, '../preload/index.mjs');
}

function rendererEntry(name: 'chrome' | 'terminal'): { url?: string; file?: string } {
  if (isDev) {
    const port = process.env['ELECTRON_RENDERER_URL'];
    if (!port) throw new Error('ELECTRON_RENDERER_URL is required in dev (set by electron-vite)');
    return { url: name === 'chrome' ? `${port}/index.html` : `${port}/terminal-host.html` };
  }
  return { file: join(__dirname, `../renderer/${name === 'chrome' ? 'index' : 'terminal-host'}.html`) };
}

async function createSessionView(sessionId: string): Promise<void> {
  if (!viewManager) return;
  viewManager.create(sessionId);
  ipcRouter.subscribe(viewManager.get(sessionId)!.webContents);
  const entry = rendererEntry('terminal');
  await viewManager.load(sessionId, {
    ...(entry.url ? { url: entry.url } : {}),
    ...(entry.file ? { file: entry.file } : {}),
    query: { sessionId },
  });
  viewManager.show(sessionId);
}

async function createTabSession(opts: Parameters<SessionManager['create']>[0]): Promise<SessionInfo> {
  const session = sessionManager.create(opts);
  tabMeta.set(session.id, {
    tabId: session.id,
    shell: opts.shell,
    cwd: opts.cwd,
    ...(opts.title ? { title: opts.title } : {}),
  });
  persistTabs();
  await createSessionView(session.id);
  return session.info();
}

// IPC: renderer asks main to spawn the platform default shell at $HOME.
ipcMain.handle(IpcChannel.SessionCreateDefault, async (): Promise<SessionInfo | { error: string }> => {
  try {
    return await createTabSession({
      shell: defaultShell(),
      cwd: homedir(),
      cols: 80,
      rows: 24,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

sessionManager.on('sessionExited', (sessionId) => {
  // Destroy the WebContentsView when the session exits. Plan 2's UX treats tab close
  // as "kill the shell AND lose the scrollback" — matches Windows Terminal, VS Code, etc.
  // Plan 3 may revisit if a "preserve exited tab" mode is wanted.
  viewManager?.destroy(sessionId);
  crashCounters.delete(sessionId);
  tabMeta.delete(sessionId);
  persistTabs();
});

let focusedSessionId: string | null = null;
ipcRouter.onLayoutShow((sessionId) => {
  focusedSessionId = sessionId;
  viewManager?.show(sessionId);
});

ipcRouter.onSetSidebarWidth((widthPx) => {
  viewManager?.setSidebarWidth(widthPx);
});

ipcRouter.onSessionCreate((opts) => createTabSession(opts));

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

  viewManager = new ViewManager({
    preloadPath: preloadPath(),
    onCrash: (sessionId) => handleRendererCrash(sessionId),
  });
  viewManager.attach(chromeWindow);
  Menu.setApplicationMenu(buildAppMenu(() => chromeWindow));

  await (() => {
    const entry = rendererEntry('chrome');
    if (entry.url) return chromeWindow!.webContents.loadURL(entry.url);
    return chromeWindow!.webContents.loadFile(entry.file!);
  })();
  ipcRouter.subscribe(chromeWindow.webContents);

  // Create the initial session so the app boots with something visible.
  await bootstrapSessions({
    loadPersisted: () => sessionStore.load(),
    createTabSession: (opts) => createTabSession(opts),
    defaultShell,
    defaultCwd: () => homedir(),
  });

  chromeWindow.on('closed', () => {
    chromeWindow = null;
    viewManager = null;
  });

  const _bridge = new NotificationBridge({
    sessionManager,
    viewManager: () => viewManager,
    chromeWindow: () => chromeWindow,
    focusedSessionId: () => focusedSessionId,
  });
}

const crashCounters = new Map<string, number[]>(); // sessionId → recent crash timestamps
function handleRendererCrash(sessionId: string): void {
  if (!viewManager) return;
  const now = Date.now();
  const recent = (crashCounters.get(sessionId) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  crashCounters.set(sessionId, recent);
  if (recent.length >= 2) {
    console.warn(`[main] tab ${sessionId} crashed twice in 60s; not auto-recovering.`);
    return;
  }
  console.warn(`[main] tab ${sessionId} crashed; recreating view + replaying scrollback.`);
  // Replacing the view re-loads the terminal page; replay() inside the new TerminalHost
  // pulls the ring buffer snapshot via core.session.replay automatically.
  void (async () => {
    const fresh = viewManager!.replaceView(sessionId);
    if (!fresh) return;
    ipcRouter.subscribe(fresh.webContents);
    const entry = rendererEntry('terminal');
    await viewManager!.load(sessionId, {
      ...(entry.url ? { url: entry.url } : {}),
      ...(entry.file ? { file: entry.file } : {}),
      query: { sessionId },
    });
    viewManager!.show(sessionId);
  })();
}

app.whenReady().then(async () => {
  await createChromeWindow();
});

app.on('second-instance', () => {
  if (chromeWindow) {
    if (chromeWindow.isMinimized()) chromeWindow.restore();
    chromeWindow.focus();
  }
});

app.on('activate', () => {
  // macOS: re-create the window when the dock icon is clicked and no windows are open.
  if (BrowserWindow.getAllWindows().length === 0) void createChromeWindow();
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
