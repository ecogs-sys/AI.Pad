import { z } from 'zod';
import {
  AttentionEventSchema,
  SessionCreateOptionsSchema,
  SessionIdSchema,
  SessionInfoSchema,
  ShellSchema,
} from './session.js';

/**
 * IPC channel names. Renderer -> Main are "core.*"; Main -> Renderer events are "event.*".
 * Both sides import these strings and the matching schemas — no string literals at call sites.
 */
export const IpcChannel = {
  // Requests (renderer -> main)
  SessionCreate: 'core.session.create',
  SessionCreateDefault: 'core.session.create-default',
  SessionCreateForPane: 'core.session.create-for-pane',
  SessionWrite: 'core.session.write',
  SessionResize: 'core.session.resize',
  SessionClose: 'core.session.close',
  SessionSetTitle: 'core.session.set-title',
  SessionList: 'core.session.list',
  SessionReplay: 'core.session.replay',
  LayoutShow: 'core.layout.show',
  LayoutSetSidebarWidth: 'core.layout.set-sidebar-width',
  LayoutModal: 'core.layout.modal',

  // Events (main -> renderer)
  SessionCreated: 'event.session.created',
  SessionData: 'event.session.data',
  SessionExited: 'event.session.exited',
  SessionTitleChanged: 'event.session.title-changed',
  SessionAttention: 'event.session.attention',
  ActionInvoke: 'event.action.invoke',
  TerminalAction: 'event.terminal.action',
} as const;

// --- Request payloads ---

export const SessionWritePayloadSchema = z.object({
  sessionId: SessionIdSchema,
  data: z.string(),
});

export const SessionResizePayloadSchema = z.object({
  sessionId: SessionIdSchema,
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

export const SessionClosePayloadSchema = z.object({
  sessionId: SessionIdSchema,
});

export const SessionSetTitlePayloadSchema = z.object({
  sessionId: SessionIdSchema,
  title: z.string().min(1).max(200),
});

export const SessionReplayPayloadSchema = z.object({
  sessionId: SessionIdSchema,
});

export const SessionReplayResponseSchema = z.object({
  sessionId: SessionIdSchema,
  data: z.string(), // base64 of RingBuffer.snapshot()
});

export type SessionReplayResponse = z.infer<typeof SessionReplayResponseSchema>;

export const LayoutShowPayloadSchema = z.object({
  sessionId: SessionIdSchema,
});

export const LayoutSetSidebarWidthPayloadSchema = z.object({
  widthPx: z.number().int().min(0),
});

/** Sent by the chrome renderer to suspend/restore the terminal WebContentsView so a
 * chrome-level modal (e.g. NewSessionDialog) is not obscured by the native overlay. */
export const LayoutModalPayloadSchema = z.object({
  open: z.boolean(),
});

export const SessionCreateForPanePayloadSchema = z.object({
  shell: ShellSchema,
  cwd: z.string().min(1),
  cols: z.number().int().positive().default(80),
  rows: z.number().int().positive().default(24),
  /** Primary session id of the tab that owns this pane. Lets main close a tab's panes
   * when the tab closes, without affecting panes in other tabs. */
  tabId: SessionIdSchema,
});

// --- Event payloads ---

export const SessionCreatedEventSchema = z.object({
  info: SessionInfoSchema,
});

export const SessionDataEventSchema = z.object({
  sessionId: SessionIdSchema,
  data: z.string(),
});

export const SessionExitedEventSchema = z.object({
  sessionId: SessionIdSchema,
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
});

export const SessionTitleChangedEventSchema = z.object({
  sessionId: SessionIdSchema,
  title: z.string(),
});

export const SessionAttentionEventSchema = AttentionEventSchema;

export const ActionInvokePayloadSchema = z.object({
  action: z.string().min(1),
});

export const TerminalActionPayloadSchema = z.object({
  action: z.enum(['splitHorizontal', 'splitVertical']),
});

// Re-export for caller convenience.
export { SessionCreateOptionsSchema, SessionInfoSchema, SessionIdSchema, AttentionEventSchema };
