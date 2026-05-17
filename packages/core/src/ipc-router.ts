import type { IpcMain, WebContents } from 'electron';
import {
  IpcChannel,
  SessionCreateOptionsSchema,
  SessionWritePayloadSchema,
  SessionResizePayloadSchema,
  SessionClosePayloadSchema,
} from '@aipad/contracts';
import type { SessionInfo, SessionId } from '@aipad/contracts';
import type { SessionManager } from './session-manager.js';

/**
 * Wires the SessionManager up to Electron IPC. Validates every inbound payload with Zod;
 * a validation failure returns a structured error and never throws into the main loop.
 *
 * Outbound events (data/exit/title) are broadcast to all subscribed WebContents. Each
 * WebContents subscribes once at preload time.
 */
export class IpcRouter {
  private readonly subscribers = new Set<WebContents>();

  constructor(
    private readonly ipcMain: IpcMain,
    private readonly manager: SessionManager,
  ) {
    this.bindRequests();
    this.bindEvents();
  }

  subscribe(wc: WebContents): void {
    this.subscribers.add(wc);
    wc.once('destroyed', () => this.subscribers.delete(wc));
  }

  private bindRequests(): void {
    this.ipcMain.handle(IpcChannel.SessionCreate, (_e, raw): SessionInfo | { error: string } => {
      const parsed = SessionCreateOptionsSchema.safeParse(raw);
      if (!parsed.success) return { error: parsed.error.message };
      return this.manager.create(parsed.data).info();
    });

    this.ipcMain.handle(IpcChannel.SessionWrite, (_e, raw): { ok: true } | { error: string } => {
      const parsed = SessionWritePayloadSchema.safeParse(raw);
      if (!parsed.success) return { error: parsed.error.message };
      const buf = Buffer.from(parsed.data.data, 'base64');
      this.manager.write(parsed.data.sessionId, buf);
      return { ok: true };
    });

    this.ipcMain.handle(IpcChannel.SessionResize, (_e, raw): { ok: true } | { error: string } => {
      const parsed = SessionResizePayloadSchema.safeParse(raw);
      if (!parsed.success) return { error: parsed.error.message };
      this.manager.resize(parsed.data.sessionId, parsed.data.cols, parsed.data.rows);
      return { ok: true };
    });

    this.ipcMain.handle(IpcChannel.SessionClose, (_e, raw): { ok: true } | { error: string } => {
      const parsed = SessionClosePayloadSchema.safeParse(raw);
      if (!parsed.success) return { error: parsed.error.message };
      this.manager.close(parsed.data.sessionId);
      return { ok: true };
    });

    this.ipcMain.handle(IpcChannel.SessionList, () => this.manager.list());
  }

  private bindEvents(): void {
    this.manager.on('sessionData', (sessionId: SessionId, chunk: Buffer) => {
      this.broadcast(IpcChannel.SessionData, {
        sessionId,
        data: chunk.toString('base64'),
      });
    });

    this.manager.on('sessionExited', (sessionId, exitCode, signal) => {
      this.broadcast(IpcChannel.SessionExited, { sessionId, exitCode, signal });
    });

    this.manager.on('sessionTitleChanged', (sessionId, title) => {
      this.broadcast(IpcChannel.SessionTitleChanged, { sessionId, title });
    });
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const wc of this.subscribers) {
      if (wc.isDestroyed()) continue;
      wc.send(channel, payload);
    }
  }
}
