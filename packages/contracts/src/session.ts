import { z } from 'zod';

export const SessionIdSchema = z.string().min(1);
export type SessionId = z.infer<typeof SessionIdSchema>;

export const SessionStatusSchema = z.enum([
  'starting',
  'running',
  'awaiting-input',
  'exited',
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const ShellSchema = z.enum(['pwsh', 'powershell', 'cmd', 'bash', 'zsh', 'wsl']);
export type Shell = z.infer<typeof ShellSchema>;

export const SessionCreateOptionsSchema = z.object({
  shell: ShellSchema,
  cwd: z.string().min(1),
  title: z.string().min(1).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cols: z.number().int().positive().default(80),
  rows: z.number().int().positive().default(24),
});
export type SessionCreateOptions = z.infer<typeof SessionCreateOptionsSchema>;

export const SessionInfoSchema = z.object({
  id: SessionIdSchema,
  title: z.string(),
  shell: ShellSchema,
  cwd: z.string(),
  status: SessionStatusSchema,
  pid: z.number().int().nullable(),
  exitCode: z.number().int().nullable(),
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

export const AttentionSignalSchema = z.enum(['bell', 'idle', 'osc']);
export type AttentionSignal = z.infer<typeof AttentionSignalSchema>;

export const AttentionEventSchema = z.object({
  sessionId: SessionIdSchema,
  signal: AttentionSignalSchema,
  confidence: z.number().min(0).max(1),
  snippet: z.string().max(256).optional(),
  timestamp: z.number().int(),
});
export type AttentionEvent = z.infer<typeof AttentionEventSchema>;
