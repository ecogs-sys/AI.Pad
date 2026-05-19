import type { IpcMain, WebContents } from 'electron';
import {
  IpcChannel,
  SessionCreateOptionsSchema,
  SessionCreateForPanePayloadSchema,
  SessionWritePayloadSchema,
  SessionResizePayloadSchema,
  SessionClosePayloadSchema,
  SessionSetTitlePayloadSchema,
  SessionReplayPayloadSchema,
  LayoutShowPayloadSchema,
  LayoutSetSidebarWidthPayloadSchema,
  LayoutModalPayloadSchema,
} from '@aipad/contracts';
import type {
  AttentionEvent,
  SessionCreateOptions,
  SessionId,
  SessionInfo,
  SessionReplayResponse,
} from '@aipad/contracts';
import type { SessionManager } from './session-manager.js';

/**
 * Wires the SessionManager up to Electron IPC. Validates every inbound payload with Zod;
 * a validation failure (or a SessionManager.create() throw) returns a structured error
 * and never throws into the main loop.
 *
 * Outbound events (created/data/exit/title/attention) are broadcast to all subscribed
 * WebContents. Each WebContents subscribes once at preload time.
 */
export type LayoutShowCallback = (sessionId: SessionId) => void;
export type SetSidebarWidthCallback = (widthPx: number) => void;
export type SessionCreateCallback = (opts: SessionCreateOptions) => Promise<SessionInfo>;
export type SessionCreateForPaneCallback = (
  opts: SessionCreateOptions,
  tabId: SessionId,
) => SessionInfo;
export type LayoutModalCallback = (open: boolean) => void;

export class IpcRouter {
  private readonly subscribers = new Set<WebContents>();
  private layoutShowCallback: LayoutShowCallback | null = null;
  private setSidebarWidthCallback: SetSidebarWidthCallback | null = null;
  private sessionCreateCallback: SessionCreateCallback | null = null;
  private sessionCreateForPaneCallback: SessionCreateForPaneCallback | null = null;
  private layoutModalCallback: LayoutModalCallback | null = null;

  constructor(
    private readonly ipcMain: IpcMain,
    private readonly manager: SessionManager,
  ) {
    this.bindRequests();
    this.bindEvents();
  }

  /** Register a callback that the chrome renderer can trigger via core.layout.show. */
  onLayoutShow(cb: LayoutShowCallback): void {
    this.layoutShowCallback = cb;
  }

  onSetSidebarWidth(cb: SetSidebarWidthCallback): void {
    this.setSidebarWidthCallback = cb;
  }

  onSessionCreate(cb: SessionCreateCallback): void {
    this.sessionCreateCallback = cb;
  }

  onSessionCreateForPane(cb: SessionCreateForPaneCallback): void {
    this.sessionCreateForPaneCallback = cb;
  }

  onLayoutModal(cb: LayoutModalCallback): void {
    this.layoutModalCallback = cb;
  }

  subscribe(wc: WebContents): void {
    this.subscribers.add(wc);
    wc.once('destroyed', () => this.subscribers.delete(wc));
  }

  private bindRequests(): void {
    this.ipcMain.handle(IpcChannel.SessionCreate, async (_e, raw): Promise<SessionInfo | { error: string }> => {
      const parsed = SessionCreateOptionsSchema.safeParse(raw);
      if (!parsed.success) return { error: parsed.error.message };
      try {
        if (this.sessionCreateCallback) {
          return await this.sessionCreateCallback(parsed.data);
        }
        return this.manager.create(parsed.data).info();
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    });

    this.ipcMain.handle(IpcChannel.SessionCreateForPane, (_e, raw): SessionInfo | { error: string } => {
      const parsed = SessionCreateForPanePayloadSchema.safeParse(raw);
      if (!parsed.success) return { error: parsed.error.message };
      try {
        // Note: NO view creation — this session lives as a pane inside the calling renderer.
        // kind='pane' so the chrome's SessionCreated handler ignores it (no phantom tab).
        const { tabId, ...opts } = parsed.data;
        if (this.sessionCreateForPaneCallback) {
          return this.sessionCreateForPaneCallback(opts, tabId);
        }
        return this.manager.create(opts, 'pane').info();
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
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

    this.ipcMain.handle(IpcChannel.SessionSetTitle, (_e, raw): { ok: true } | { error: string } => {
      const parsed = SessionSetTitlePayloadSchema.safeParse(raw);
      if (!parsed.success) return { error: parsed.error.message };
      // setTitle emits titleChanged -> broadcast as SessionTitleChanged; main also
      // listens to persist the new title into tabMeta.
      this.manager.get(parsed.data.sessionId)?.setTitle(parsed.data.title);
      return { ok: true };
    });

    this.ipcMain.handle(IpcChannel.SessionList, () => this.manager.list());

    this.ipcMain.handle(
      IpcChannel.SessionReplay,
      (_e, raw): SessionReplayResponse | { error: string } => {
        const parsed = SessionReplayPayloadSchema.safeParse(raw);
        if (!parsed.success) return { error: parsed.error.message };
        const session = this.manager.get(parsed.data.sessionId);
        if (!session) return { sessionId: parsed.data.sessionId, data: '' };
        return {
          sessionId: parsed.data.sessionId,
          data: session.ringBuffer.snapshot().toString('base64'),
        };
      },
    );

    this.ipcMain.handle(IpcChannel.LayoutShow, (_e, raw): { ok: true } | { error: string } => {
      const parsed = LayoutShowPayloadSchema.safeParse(raw);
      if (!parsed.success) return { error: parsed.error.message };
      this.layoutShowCallback?.(parsed.data.sessionId);
      return { ok: true };
    });

    this.ipcMain.handle(IpcChannel.LayoutSetSidebarWidth, (_e, raw): { ok: true } | { error: string } => {
      const parsed = LayoutSetSidebarWidthPayloadSchema.safeParse(raw);
      if (!parsed.success) return { error: parsed.error.message };
      this.setSidebarWidthCallback?.(parsed.data.widthPx);
      return { ok: true };
    });

    this.ipcMain.handle(IpcChannel.LayoutModal, (_e, raw): { ok: true } | { error: string } => {
      const parsed = LayoutModalPayloadSchema.safeParse(raw);
      if (!parsed.success) return { error: parsed.error.message };
      this.layoutModalCallback?.(parsed.data.open);
      return { ok: true };
    });
  }

  private bindEvents(): void {
    this.manager.on('sessionCreated', (info: SessionInfo) => {
      this.broadcast(IpcChannel.SessionCreated, { info });
    });

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

    this.manager.on('sessionAttention', (ev: AttentionEvent) => {
      this.broadcast(IpcChannel.SessionAttention, ev);
    });
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const wc of this.subscribers) {
      if (wc.isDestroyed()) continue;
      wc.send(channel, payload);
    }
  }
}
