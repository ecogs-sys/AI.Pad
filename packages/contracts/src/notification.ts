import { z } from 'zod';
import { SessionIdSchema } from './session.js';

export const NotificationRequestSchema = z.object({
  sessionId: SessionIdSchema,
  title: z.string().min(1).max(120),
  body: z.string().max(512),
});
export type NotificationRequest = z.infer<typeof NotificationRequestSchema>;
