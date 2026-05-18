import type { SessionId, SessionInfo, AttentionEvent } from '@aipad/contracts';
import { IpcChannel } from '@aipad/contracts';
import type { PreloadBridge } from '@aipad/terminal-host';
import { TabStrip, type TabViewModel } from './tab-strip.js';
import { Sidebar, type SidebarRowVm } from './sidebar.js';
import { emptyState, type ChromeState, type SessionState } from './state.js';

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

    // Pull initial session list (main may have already spawned the boot session).
    const list = (await this.bridge.send(IpcChannel.SessionList)) as SessionInfo[];
    for (const info of list) this.upsertSession(info);
    if (!this.state.focusedId && this.state.tabOrder[0]) this.focus(this.state.tabOrder[0]);

    // Tick sidebar time-in-state once per second.
    this.tickHandle = setInterval(() => this.render(), 1_000);

    this.render();
  }

  // --- Public actions invoked by TabStrip/Sidebar callbacks and keyboard ---

  async newTab(): Promise<void> {
    const info = (await this.bridge.send(IpcChannel.SessionCreateDefault)) as
      | SessionInfo
      | { error: string };
    if ('error' in info) {
      console.error('[chrome] new tab failed:', info.error);
      return;
    }
    // SessionCreated event will arrive and populate state; nothing else to do.
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
