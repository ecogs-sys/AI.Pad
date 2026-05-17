import { z } from 'zod';
import { SessionCreateOptionsSchema, SessionIdSchema, SessionInfoSchema } from './session.js';

/**
 * IPC channel names. Renderer -> Main are "core.*"; Main -> Renderer events are "event.*".
 * Both sides import these strings and the matching schemas — no string literals at call sites.
 */
export const IpcChannel = {
  SessionCreate: 'core.session.create',
  SessionWrite: 'core.session.write',
  SessionResize: 'core.session.resize',
  SessionClose: 'core.session.close',
  SessionList: 'core.session.list',

  SessionData: 'event.session.data',
  SessionExited: 'event.session.exited',
  SessionTitleChanged: 'event.session.title-changed',
} as const;

export const SessionWritePayloadSchema = z.object({
  sessionId: SessionIdSchema,
  data: z.string(), // Base64-encoded bytes from renderer; main decodes.
});

export const SessionResizePayloadSchema = z.object({
  sessionId: SessionIdSchema,
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

export const SessionClosePayloadSchema = z.object({
  sessionId: SessionIdSchema,
});

export const SessionDataEventSchema = z.object({
  sessionId: SessionIdSchema,
  data: z.string(), // Base64 chunk from PTY stdout.
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

// Re-export for caller convenience.
export { SessionCreateOptionsSchema, SessionInfoSchema, SessionIdSchema };
