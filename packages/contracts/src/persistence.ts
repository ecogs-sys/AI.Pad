import { z } from 'zod';
import { ShellSchema } from './session.js';

export const PERSISTENCE_SCHEMA_VERSION = 2;

export type PersistedSplitNode =
  | { kind: 'leaf' }
  | {
      kind: 'branch';
      orientation: 'horizontal' | 'vertical';
      ratio: number;
      a: PersistedSplitNode;
      b: PersistedSplitNode;
    };

export const PersistedSplitNodeSchema: z.ZodType<PersistedSplitNode> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('leaf') }),
    z.object({
      kind: z.literal('branch'),
      orientation: z.enum(['horizontal', 'vertical']),
      ratio: z.number().min(0.1).max(0.9),
      a: PersistedSplitNodeSchema,
      b: PersistedSplitNodeSchema,
    }),
  ]),
);

export const PersistedTabSchema = z.object({
  tabId: z.string().min(1),
  shell: ShellSchema,
  cwd: z.string().min(1),
  title: z.string().optional(),
  splits: PersistedSplitNodeSchema.optional(),
});
export type PersistedTab = z.infer<typeof PersistedTabSchema>;

export const PersistedTabsSchema = z.object({
  version: z.literal(PERSISTENCE_SCHEMA_VERSION),
  tabs: z.array(PersistedTabSchema),
  focusedTabId: z.string().nullable(),
});
export type PersistedTabs = z.infer<typeof PersistedTabsSchema>;

/**
 * Migrate an unknown payload read from disk into the current schema's shape, *before*
 * `PersistedTabsSchema.safeParse` validates it. Returns the (possibly mutated) payload
 * on success, or null if the version is missing/unknown — in which case callers should
 * treat the file as broken and fall back to a fresh start.
 *
 * v1 -> v2: stamp `version: 2`; leave `splits` undefined on every tab.
 */
export function migratePersistedTabs(parsed: unknown): unknown | null {
  if (parsed === null || typeof parsed !== 'object') return null;
  const obj = parsed as { version?: unknown };
  if (obj.version === 1) {
    return { ...obj, version: 2 };
  }
  if (obj.version === 2) return obj;
  return null;
}
