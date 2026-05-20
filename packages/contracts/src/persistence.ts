import { z } from 'zod';
import { ShellSchema } from './session.js';

export const PERSISTENCE_SCHEMA_VERSION = 1;

export const PersistedTabSchema = z.object({
  tabId: z.string().min(1),
  shell: ShellSchema,
  cwd: z.string().min(1),
  title: z.string().optional(),
});
export type PersistedTab = z.infer<typeof PersistedTabSchema>;

export const PersistedTabsSchema = z.object({
  version: z.literal(PERSISTENCE_SCHEMA_VERSION),
  tabs: z.array(PersistedTabSchema),
  focusedTabId: z.string().nullable(),
});
export type PersistedTabs = z.infer<typeof PersistedTabsSchema>;
