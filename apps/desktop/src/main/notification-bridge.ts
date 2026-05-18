import { BrowserWindow, Notification } from 'electron';
import type { SessionManager } from '@aipad/core';
import { NotificationService } from '@aipad/core';
import type { AttentionEvent, SessionId } from '@aipad/contracts';
import { IpcChannel } from '@aipad/contracts';
import type { ViewManager } from './view-manager.js';

export interface NotificationBridgeDeps {
  sessionManager: SessionManager;
  viewManager: () => ViewManager | null;
  chromeWindow: () => BrowserWindow | null;
  focusedSessionId: () => SessionId | null;
}

export class NotificationBridge {
  private readonly service: NotificationService;

  constructor(private readonly deps: NotificationBridgeDeps) {
    this.service = new NotificationService(Notification as unknown as new (opts: { title: string; body: string }) => InstanceType<typeof Notification>);
    this.service.onClick((sessionId) => this.handleClick(sessionId));
    this.deps.sessionManager.on('sessionAttention', (ev) => this.handleAttention(ev));
  }

  private handleAttention(ev: AttentionEvent): void {
    const win = this.deps.chromeWindow();
    const focused = this.deps.focusedSessionId();
    const windowFocused = win?.isFocused() ?? false;
    const tabFocused = focused === ev.sessionId;
    if (windowFocused && tabFocused) return;
    const info = this.deps.sessionManager.list().find((s) => s.id === ev.sessionId);
    const title = info?.title ?? 'AI.Pad session';
    this.service.notify({
      sessionId: ev.sessionId,
      title: `${title} needs you`,
      body: ev.snippet?.trim().slice(0, 240) ?? `Signal: ${ev.signal}`,
    });
  }

  private handleClick(sessionId: SessionId): void {
    const win = this.deps.chromeWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    const vm = this.deps.viewManager();
    vm?.show(sessionId);
    // Also tell the chrome renderer to update its focused tab + clear the badge.
    win?.webContents.send(IpcChannel.LayoutShow, { sessionId });
  }
}
