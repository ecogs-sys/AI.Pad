import type { SessionId, SessionInfo, AttentionEvent, Shell } from '@aipad/contracts';
import { IpcChannel } from '@aipad/contracts';
import type { PreloadBridge } from '@aipad/terminal-host';
import { TabStrip, type TabViewModel } from './tab-strip.js';
import { Sidebar, type SidebarRowVm } from './sidebar.js';
import { emptyState, type ChromeState, type SessionState } from './state.js';
import { showNewSessionDialog, showRenameDialog } from './new-session-dialog.js';

export interface LayoutDeps {
  bridge: PreloadBridge;
  tabStrip: TabStrip;
  sidebar: Sidebar;
  bodyEl: HTMLElement;
}

export class LayoutManager {
  private readonly bridge: PreloadBridge;
  private readonly tabStrip: TabStrip;
  private readonly sidebar: Sidebar;
  private readonly bodyEl: HTMLElement;
  private readonly state: ChromeState = emptyState();
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  constructor(deps: LayoutDeps) {
    this.bridge = deps.bridge;
    this.tabStrip = deps.tabStrip;
    this.sidebar = deps.sidebar;
    this.bodyEl = deps.bodyEl;
  }

  async start(): Promise<void> {
    // Subscribe to events FIRST (before any await), then query the list. This order
    // closes the race where main may create the boot session between the list query
    // and the listener registration. `upsertSession` is idempotent so double-counting
    // is safe.
    this.bridge.on(IpcChannel.SessionCreated, (raw) => {
      const e = raw as { info: SessionInfo };
      // Pane sessions live inside a tab's terminal renderer — they are never tabs.
      if (e.info.kind === 'pane') return;
      this.upsertSession(e.info);
      this.focus(e.info.id);
    });
    this.bridge.on(IpcChannel.SessionExited, (raw) => {
      const e = raw as { sessionId: SessionId; exitCode: number | null };
      const session = this.state.sessions.get(e.sessionId);
      if (session) {
        session.info = { ...session.info, status: 'exited', exitCode: e.exitCode };
        session.statusSinceMs = Date.now();
        this.render();
      }
    });
    this.bridge.on(IpcChannel.SessionAttention, (raw) => {
      const e = raw as AttentionEvent;
      const session = this.state.sessions.get(e.sessionId);
      if (!session) return;
      // Don't badge the currently focused tab — the user is already on it.
      if (this.state.focusedId === e.sessionId) return;
      session.attention = true;
      session.info = { ...session.info, status: 'awaiting-input' };
      session.statusSinceMs = Date.now();
      this.render();
    });
    // Main may push LayoutShow when the user clicks a notification — keep our state in sync.
    this.bridge.on(IpcChannel.LayoutShow, (raw) => {
      const e = raw as { sessionId: SessionId };
      if (this.state.sessions.has(e.sessionId)) this.focus(e.sessionId);
    });
    // Title changes (rename) are echoed by main — keep tab/sidebar labels in sync.
    this.bridge.on(IpcChannel.SessionTitleChanged, (raw) => {
      const e = raw as { sessionId: SessionId; title: string };
      const session = this.state.sessions.get(e.sessionId);
      if (!session) return;
      session.info = { ...session.info, title: e.title };
      this.render();
    });

    // Pull initial session list (main may have already spawned the boot session).
    const list = (await this.bridge.send(IpcChannel.SessionList)) as SessionInfo[];
    for (const info of list) {
      if (info.kind === 'pane') continue;
      this.upsertSession(info);
    }
    if (!this.state.focusedId && this.state.tabOrder[0]) this.focus(this.state.tabOrder[0]);

    // Tick sidebar time-in-state once per second.
    this.tickHandle = setInterval(() => this.render(), 1_000);

    this.render();
  }

  // --- Public actions invoked by TabStrip/Sidebar callbacks and keyboard ---

  async newTab(): Promise<void> {
    await this.openNewTabDialog();
  }

  async openNewTabDialog(): Promise<void> {
    const mount = document.getElementById('dialog-mount');
    if (!mount) return;
    // Suspend the terminal overlay so the modal is visible, restore it afterwards.
    void this.bridge.send(IpcChannel.LayoutModal, { open: true });
    let result: { shell: Shell; cwd: string } | null;
    try {
      result = await showNewSessionDialog(mount, {
        defaultShell: this.platformDefaultShell(),
        defaultCwd: this.platformDefaultCwd(),
      });
    } finally {
      void this.bridge.send(IpcChannel.LayoutModal, { open: false });
    }
    if (!result) return;
    const info = (await this.bridge.send(IpcChannel.SessionCreate, {
      shell: result.shell,
      cwd: result.cwd,
      cols: 80,
      rows: 24,
    })) as SessionInfo | { error: string };
    if ('error' in info) {
      console.error('[chrome] new tab failed:', info.error);
    }
  }

  private platformDefaultShell(): Shell {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'pwsh';
    if (ua.includes('Mac OS')) return 'zsh';
    return 'bash';
  }

  private platformDefaultCwd(): string {
    // Chrome renderer can't read $HOME directly; fall back to the last-used cwd from state,
    // otherwise '~' which the platform shell will expand.
    for (const session of this.state.sessions.values()) {
      if (session.info.cwd) return session.info.cwd;
    }
    return '~';
  }

  async closeTab(sessionId: SessionId): Promise<void> {
    await this.bridge.send(IpcChannel.SessionClose, { sessionId });
    // Local cleanup happens lazily on the SessionExited event. Optimistically remove tab
    // ordering so the UI feels responsive.
    this.state.sessions.delete(sessionId);
    this.state.tabOrder = this.state.tabOrder.filter((id) => id !== sessionId);
    if (this.state.focusedId === sessionId) {
      this.state.focusedId = this.state.tabOrder[this.state.tabOrder.length - 1] ?? null;
      if (this.state.focusedId) this.bridge.send(IpcChannel.LayoutShow, { sessionId: this.state.focusedId });
    }
    this.render();
  }

  reorderTab(draggedId: SessionId, beforeId: SessionId | null): void {
    const dragIdx = this.state.tabOrder.indexOf(draggedId);
    if (dragIdx < 0) return;
    const [moved] = this.state.tabOrder.splice(dragIdx, 1);
    if (!moved) return;
    if (beforeId === null) {
      this.state.tabOrder.push(moved);
    } else {
      const beforeIdx = this.state.tabOrder.indexOf(beforeId);
      this.state.tabOrder.splice(beforeIdx, 0, moved);
    }
    // Persist the new order so it survives a restart.
    void this.bridge.send(IpcChannel.LayoutReorderTabs, { order: [...this.state.tabOrder] });
    this.render();
  }

  async renameTab(sessionId: SessionId): Promise<void> {
    const session = this.state.sessions.get(sessionId);
    if (!session) return;
    const mount = document.getElementById('dialog-mount');
    if (!mount) return;
    void this.bridge.send(IpcChannel.LayoutModal, { open: true });
    let newTitle: string | null;
    try {
      newTitle = await showRenameDialog(mount, session.info.title);
    } finally {
      void this.bridge.send(IpcChannel.LayoutModal, { open: false });
    }
    if (!newTitle) return;
    // Main echoes SessionTitleChanged, which updates local state + persists.
    await this.bridge.send(IpcChannel.SessionSetTitle, { sessionId, title: newTitle });
  }

  async duplicateTab(sessionId: SessionId): Promise<void> {
    const session = this.state.sessions.get(sessionId);
    if (!session) return;
    const info = (await this.bridge.send(IpcChannel.SessionCreate, {
      shell: session.info.shell,
      cwd: session.info.cwd,
      cols: 80,
      rows: 24,
    })) as SessionInfo | { error: string };
    if ('error' in info) console.error('[chrome] duplicate failed:', info.error);
  }

  focus(sessionId: SessionId): void {
    if (!this.state.sessions.has(sessionId)) return;
    this.state.focusedId = sessionId;
    const session = this.state.sessions.get(sessionId)!;
    if (session.attention) {
      session.attention = false; // clear badge on focus
    }
    void this.bridge.send(IpcChannel.LayoutShow, { sessionId });
    this.render();
  }

  focusNext(): void {
    if (this.state.tabOrder.length === 0) return;
    const idx = this.state.focusedId ? this.state.tabOrder.indexOf(this.state.focusedId) : -1;
    const next = this.state.tabOrder[(idx + 1) % this.state.tabOrder.length]!;
    this.focus(next);
  }

  focusPrev(): void {
    if (this.state.tabOrder.length === 0) return;
    const idx = this.state.focusedId ? this.state.tabOrder.indexOf(this.state.focusedId) : 0;
    const prev = this.state.tabOrder[(idx - 1 + this.state.tabOrder.length) % this.state.tabOrder.length]!;
    this.focus(prev);
  }

  focusIndex(oneBasedIndex: number): void {
    const target = this.state.tabOrder[oneBasedIndex - 1];
    if (target) this.focus(target);
  }

  closeFocused(): void {
    if (this.state.focusedId) void this.closeTab(this.state.focusedId);
  }

  toggleSidebar(): void {
    this.state.sidebarOpen = !this.state.sidebarOpen;
    this.bodyEl.classList.toggle('sidebar-collapsed', !this.state.sidebarOpen);
    document.body.classList.toggle('sidebar-collapsed', !this.state.sidebarOpen);
    const widthPx = this.state.sidebarOpen ? 220 : 36;
    void this.bridge.send(IpcChannel.LayoutSetSidebarWidth, { widthPx });
    this.render();
  }

  // --- Internals ---

  private upsertSession(info: SessionInfo): void {
    const existing = this.state.sessions.get(info.id);
    if (existing) {
      const statusChanged = existing.info.status !== info.status;
      existing.info = info;
      if (statusChanged) existing.statusSinceMs = Date.now();
    } else {
      const fresh: SessionState = {
        info,
        attention: false,
        statusSinceMs: Date.now(),
      };
      this.state.sessions.set(info.id, fresh);
      this.state.tabOrder.push(info.id);
    }
    this.render();
  }

  private render(): void {
    const tabs: TabViewModel[] = this.state.tabOrder
      .map((id) => this.state.sessions.get(id))
      .filter((s): s is SessionState => !!s)
      .map((s) => ({ info: s.info, attention: s.attention }));
    this.tabStrip.render(tabs, this.state.focusedId);

    const rows: SidebarRowVm[] = this.state.tabOrder
      .map((id) => this.state.sessions.get(id))
      .filter((s): s is SessionState => !!s)
      .map((s) => ({ info: s.info, attention: s.attention, statusSinceMs: s.statusSinceMs }));
    this.sidebar.render(rows, this.state.focusedId);
  }
}
