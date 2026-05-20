# Rate-Limit Auto-Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect a configured rate-limit phrase in any terminal tab, parse the reset time that follows it, and automatically type a configured response into that tab at the reset time.

**Architecture:** A Core-plane subsystem parallel to `AttentionDetector`. `RateLimitDetector` scans each session's ANSI-stripped output for a literal phrase; `ResetTimeParser` turns the following clock time into an absolute instant; `ResumeScheduler` holds pending resumes in memory and a periodic sweep fires them; `SettingsStore` persists the user-configurable phrase, response, and enable toggle. The Chrome plane gets a View → Settings modal and a countdown badge.

**Tech Stack:** TypeScript (strict), Node.js, Electron, Zod (contracts), `luxon` (timezone math), Vitest (unit + integration), Playwright (E2E), pnpm workspaces.

---

## Conventions

- Core unit tests live in `packages/core/tests/*.test.ts` and import production code by relative path (e.g. `from '../src/foo.js'`). Run with `pnpm --filter @aipad/core test`.
- A single core test file: `pnpm --filter @aipad/core exec vitest run <name>`.
- `@aipad/contracts` is consumed by other packages from its built `dist/`. **After editing `packages/contracts/src/`, always run `pnpm --filter @aipad/contracts build`** before typechecking or testing dependents.
- `@aipad/core` is consumed by the desktop app and integration tests from its built `dist/`. Rebuild with `pnpm --filter @aipad/core build` before desktop typecheck/build or integration tests.
- `.js` extensions in imports are required (NodeNext module resolution) even for `.ts` source.

---

## Task 1: Add the `luxon` dependency to `@aipad/core`

**Files:**
- Modify: `packages/core/package.json:13-24`

- [ ] **Step 1: Add the dependency entries**

In `packages/core/package.json`, add `"luxon": "^3.5.0"` to `dependencies` and `"@types/luxon": "^3.4.2"` to `devDependencies`. The result:

```json
  "dependencies": {
    "@aipad/contracts": "workspace:*",
    "luxon": "^3.5.0",
    "node-pty": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/luxon": "^3.4.2",
    "@types/node": "^20.14.0",
    "@vitest/coverage-v8": "^2.1.0",
    "electron": "^33.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: completes without error; `node_modules/.pnpm` now contains `luxon` and `@types/luxon`.

- [ ] **Step 3: Verify luxon resolves**

Run: `pnpm --filter @aipad/core exec node -e "import('luxon').then(m => console.log(typeof m.DateTime))"`
Expected: prints `function`.

- [ ] **Step 4: Commit**

```bash
git add packages/core/package.json pnpm-lock.yaml
git commit -m "build: add luxon dependency to @aipad/core"
```

---

## Task 2: Add the `AppSettings` contract

**Files:**
- Create: `packages/contracts/src/settings.ts`
- Modify: `packages/contracts/src/index.ts:1-4`
- Test: `packages/core/tests/settings-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/settings-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AppSettingsSchema, DEFAULT_APP_SETTINGS } from '@aipad/contracts';

describe('AppSettingsSchema', () => {
  it('accepts the default settings', () => {
    expect(AppSettingsSchema.safeParse(DEFAULT_APP_SETTINGS).success).toBe(true);
  });

  it('rejects a missing autoResume block', () => {
    expect(AppSettingsSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-boolean enabled flag', () => {
    const bad = { autoResume: { enabled: 'yes', detectText: 'x', responseText: 'continue' } };
    expect(AppSettingsSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a detectText longer than 200 characters', () => {
    const bad = {
      autoResume: { enabled: true, detectText: 'x'.repeat(201), responseText: 'continue' },
    };
    expect(AppSettingsSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts an empty detectText and empty responseText', () => {
    const ok = { autoResume: { enabled: false, detectText: '', responseText: '' } };
    expect(AppSettingsSchema.safeParse(ok).success).toBe(true);
  });

  it('defaults to enabled with the Claude-Code limit phrase and "continue"', () => {
    expect(DEFAULT_APP_SETTINGS.autoResume.enabled).toBe(true);
    expect(DEFAULT_APP_SETTINGS.autoResume.detectText).toBe("You've hit your limit");
    expect(DEFAULT_APP_SETTINGS.autoResume.responseText).toBe('continue');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aipad/core exec vitest run settings-schema`
Expected: FAIL — `AppSettingsSchema`/`DEFAULT_APP_SETTINGS` are not exported by `@aipad/contracts`.

- [ ] **Step 3: Create the contract**

Create `packages/contracts/src/settings.ts`:

```ts
import { z } from 'zod';

/** Per-feature configuration for rate-limit auto-resume. */
export const AutoResumeSettingsSchema = z.object({
  enabled: z.boolean(),
  /** Literal substring that marks a rate-limit message. Empty = feature inert. */
  detectText: z.string().max(200),
  /** Text typed (followed by Enter) into the tab when the limit resets. */
  responseText: z.string().max(200),
});
export type AutoResumeSettings = z.infer<typeof AutoResumeSettingsSchema>;

/** Top-level persisted application settings. */
export const AppSettingsSchema = z.object({
  autoResume: AutoResumeSettingsSchema,
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoResume: {
    enabled: true,
    detectText: "You've hit your limit",
    responseText: 'continue',
  },
};
```

- [ ] **Step 4: Export it from the contracts barrel**

In `packages/contracts/src/index.ts`, add `export * from './settings.js';` so the file reads:

```ts
export * from './session.js';
export * from './ipc.js';
export * from './notification.js';
export * from './persistence.js';
export * from './settings.js';
```

- [ ] **Step 5: Rebuild contracts and run the test**

Run: `pnpm --filter @aipad/contracts build && pnpm --filter @aipad/core exec vitest run settings-schema`
Expected: PASS — all 6 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/settings.ts packages/contracts/src/index.ts packages/core/tests/settings-schema.test.ts
git commit -m "feat(contracts): add AppSettings schema for auto-resume"
```

---

## Task 3: Add IPC channels and payload schemas

**Files:**
- Modify: `packages/contracts/src/ipc.ts:14-41` (channel names), `:139-148` (payload schemas + re-exports)
- Test: `packages/core/tests/resume-ipc-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/resume-ipc-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  IpcChannel,
  ResumeCancelPayloadSchema,
  ResumeScheduledEventSchema,
} from '@aipad/contracts';

describe('resume + settings IPC contracts', () => {
  it('exposes the new channel names', () => {
    expect(IpcChannel.SettingsGet).toBe('core.settings.get');
    expect(IpcChannel.SettingsUpdate).toBe('core.settings.update');
    expect(IpcChannel.ResumeCancel).toBe('core.resume.cancel');
    expect(IpcChannel.SettingsChanged).toBe('event.settings.changed');
    expect(IpcChannel.ResumeScheduled).toBe('event.resume.scheduled');
    expect(IpcChannel.ResumeCancelled).toBe('event.resume.cancelled');
    expect(IpcChannel.ResumeFired).toBe('event.resume.fired');
  });

  it('validates a resume-cancel payload', () => {
    expect(ResumeCancelPayloadSchema.safeParse({ sessionId: 'abc' }).success).toBe(true);
    expect(ResumeCancelPayloadSchema.safeParse({ sessionId: '' }).success).toBe(false);
  });

  it('validates a resume-scheduled event', () => {
    expect(ResumeScheduledEventSchema.safeParse({ sessionId: 'a', resetAt: 1_700_000_000_000 }).success).toBe(true);
    expect(ResumeScheduledEventSchema.safeParse({ sessionId: 'a', resetAt: 'soon' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aipad/core exec vitest run resume-ipc-schema`
Expected: FAIL — the new channels/schemas are not exported.

- [ ] **Step 3: Add the channel names**

In `packages/contracts/src/ipc.ts`, inside the `IpcChannel` object, add to the "Requests" block (after `LayoutDefaultCwd`):

```ts
  SettingsGet: 'core.settings.get',
  SettingsUpdate: 'core.settings.update',
  ResumeCancel: 'core.resume.cancel',
```

and to the "Events" block (after `TerminalAction`):

```ts
  SettingsChanged: 'event.settings.changed',
  ResumeScheduled: 'event.resume.scheduled',
  ResumeCancelled: 'event.resume.cancelled',
  ResumeFired: 'event.resume.fired',
```

- [ ] **Step 4: Add the payload schemas**

In `packages/contracts/src/ipc.ts`, at the end of the file but **before** the final `export { ... }` re-export line, add:

```ts
// --- Settings + resume payloads ---

export const ResumeCancelPayloadSchema = z.object({
  sessionId: SessionIdSchema,
});

export const ResumeScheduledEventSchema = z.object({
  sessionId: SessionIdSchema,
  resetAt: z.number().int(),
});

export const ResumeCancelledEventSchema = z.object({
  sessionId: SessionIdSchema,
});

export const ResumeFiredEventSchema = z.object({
  sessionId: SessionIdSchema,
});
```

(The `core.settings.update` payload is validated with `AppSettingsSchema` from `settings.ts`; `core.settings.get` takes no payload.)

- [ ] **Step 5: Rebuild contracts and run the test**

Run: `pnpm --filter @aipad/contracts build && pnpm --filter @aipad/core exec vitest run resume-ipc-schema`
Expected: PASS — all 3 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/ipc.ts packages/core/tests/resume-ipc-schema.test.ts
git commit -m "feat(contracts): add settings + resume IPC channels and schemas"
```

---

## Task 4: `SettingsStore` — persist app settings

**Files:**
- Create: `packages/core/src/settings-store.ts`
- Test: `packages/core/tests/settings-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/settings-store.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_APP_SETTINGS } from '@aipad/contracts';
import { SettingsStore } from '../src/settings-store.js';

const dirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'aipad-settings-'));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true });
});

describe('SettingsStore', () => {
  it('returns the defaults when no file exists', async () => {
    const store = new SettingsStore(tempDir());
    expect(await store.load()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('round-trips a saved value', async () => {
    const dir = tempDir();
    const next = { autoResume: { enabled: false, detectText: 'LIMIT', responseText: 'go' } };
    await new SettingsStore(dir).save(next);
    expect(await new SettingsStore(dir).load()).toEqual(next);
  });

  it('recovers from a corrupt file by backing it up and returning defaults', async () => {
    const dir = tempDir();
    await fs.writeFile(join(dir, 'settings.json'), '{ not json', 'utf8');
    const store = new SettingsStore(dir);
    expect(await store.load()).toEqual(DEFAULT_APP_SETTINGS);
    const entries = await fs.readdir(dir);
    expect(entries.some((e) => e.startsWith('settings.json.broken-'))).toBe(true);
  });

  it('recovers from a schema-mismatched file', async () => {
    const dir = tempDir();
    await fs.writeFile(join(dir, 'settings.json'), JSON.stringify({ autoResume: { enabled: 1 } }), 'utf8');
    expect(await new SettingsStore(dir).load()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('reports write failures through the onError callback', async () => {
    // An empty string is not a valid directory path -> writeAtomic rejects.
    const store = new SettingsStore('');
    let captured: unknown = null;
    store.onError((err) => { captured = err; });
    await store.save(DEFAULT_APP_SETTINGS);
    expect(captured).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aipad/core exec vitest run settings-store`
Expected: FAIL — `../src/settings-store.js` does not exist.

- [ ] **Step 3: Implement `SettingsStore`**

Create `packages/core/src/settings-store.ts`:

```ts
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { AppSettingsSchema, DEFAULT_APP_SETTINGS, type AppSettings } from '@aipad/contracts';

const FILE_NAME = 'settings.json';

/**
 * Reads and writes the persisted application settings. Writes are atomic via
 * temp-file + rename. A missing, corrupt, or schema-mismatched file yields the
 * defaults (the corrupt file is renamed aside) so the app always boots.
 * Modelled on SessionStore.
 */
export class SettingsStore {
  private writeChain: Promise<void> = Promise.resolve();
  private errorCallback: ((err: unknown) => void) | null = null;

  constructor(private readonly dir: string) {}

  /** Register a callback invoked when an atomic write fails. save() stays
   * non-throwing so callers are not disrupted. */
  onError(cb: (err: unknown) => void): void {
    this.errorCallback = cb;
  }

  /** Load settings, always resolving to a valid AppSettings (defaults on any fault). */
  async load(): Promise<AppSettings> {
    const path = join(this.dir, FILE_NAME);
    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_APP_SETTINGS;
      throw err;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await this.backup(path);
      return DEFAULT_APP_SETTINGS;
    }
    const result = AppSettingsSchema.safeParse(parsed);
    if (!result.success) {
      await this.backup(path);
      return DEFAULT_APP_SETTINGS;
    }
    return result.data;
  }

  /** Save settings atomically. Concurrent calls are serialized via a chained promise. */
  save(payload: AppSettings): Promise<void> {
    this.writeChain = this.writeChain
      .then(() => this.writeAtomic(payload))
      .catch((err) => {
        this.errorCallback?.(err);
      });
    return this.writeChain;
  }

  private async writeAtomic(payload: AppSettings): Promise<void> {
    const path = join(this.dir, FILE_NAME);
    const tmp = `${path}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    const json = JSON.stringify(payload, null, 2);
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(tmp, json, 'utf8');
    await fs.rename(tmp, path);
  }

  private async backup(path: string): Promise<void> {
    const dest = `${path}.broken-${Date.now()}`;
    try {
      await fs.rename(path, dest);
    } catch {
      /* If we can't rename, drop it — the file is broken anyway. */
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aipad/core exec vitest run settings-store`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/settings-store.ts packages/core/tests/settings-store.test.ts
git commit -m "feat(core): add SettingsStore for persisted app settings"
```

---

## Task 5: `ResetTimeParser` — parse a reset clock time into an instant

**Files:**
- Create: `packages/core/src/reset-time-parser.ts`
- Test: `packages/core/tests/reset-time-parser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/reset-time-parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { parseResetTime } from '../src/reset-time-parser.js';

describe('parseResetTime', () => {
  it('parses a clock time with an IANA timezone', () => {
    const now = DateTime.fromObject(
      { year: 2026, month: 5, day: 20, hour: 12, minute: 0 },
      { zone: 'Pacific/Auckland' },
    ).toJSDate();
    const ms = parseResetTime("You've hit your limit · resets 9:30pm (Pacific/Auckland)", now);
    expect(ms).not.toBeNull();
    const dt = DateTime.fromMillis(ms!, { zone: 'Pacific/Auckland' });
    expect(dt.hour).toBe(21);
    expect(dt.minute).toBe(30);
    expect(dt.day).toBe(20); // 9:30pm today, still in the future
  });

  it('rolls to the next day when the time has already passed', () => {
    const now = DateTime.fromObject(
      { year: 2026, month: 5, day: 20, hour: 23, minute: 0 },
      { zone: 'Pacific/Auckland' },
    ).toJSDate();
    const ms = parseResetTime('resets 9:30am (Pacific/Auckland)', now);
    expect(ms).not.toBeNull();
    const dt = DateTime.fromMillis(ms!, { zone: 'Pacific/Auckland' });
    expect(dt.day).toBe(21);
    expect(dt.hour).toBe(9);
    expect(dt.minute).toBe(30);
  });

  it('uses the system local timezone when none is given', () => {
    const now = new Date(2026, 4, 20, 1, 0, 0); // local 01:00
    const ms = parseResetTime('resets 3pm', now);
    expect(ms).not.toBeNull();
    expect(new Date(ms!).getHours()).toBe(15);
    expect(ms!).toBeGreaterThan(now.getTime());
  });

  it('parses an upper-case "11:00 AM" form', () => {
    const now = new Date(2026, 4, 20, 6, 0, 0);
    const ms = parseResetTime('resets 11:00 AM', now);
    expect(new Date(ms!).getHours()).toBe(11);
  });

  it('falls back to local time when the timezone is unknown', () => {
    const now = new Date(2026, 4, 20, 1, 0, 0);
    const ms = parseResetTime('resets 3pm (Not/AZone)', now);
    expect(ms).not.toBeNull();
    expect(new Date(ms!).getHours()).toBe(15);
  });

  it('returns null when no clock time is present', () => {
    expect(parseResetTime('You have plenty of quota left', new Date())).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(parseResetTime('25:99 xx', new Date())).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aipad/core exec vitest run reset-time-parser`
Expected: FAIL — `../src/reset-time-parser.js` does not exist.

- [ ] **Step 3: Implement `ResetTimeParser`**

Create `packages/core/src/reset-time-parser.ts`:

```ts
import { DateTime } from 'luxon';

/** Matches "9:30pm", "3pm", "11:00 AM" — 12-hour clock with optional minutes. */
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b/i;

/** Matches an IANA timezone in parentheses, e.g. "(Pacific/Auckland)". */
const TZ_RE = /\(([A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+)\)/;

/**
 * Find a clock time (and optional IANA timezone) in `text` and return the next
 * future occurrence of it, as epoch milliseconds, relative to `now`.
 *
 * - No timezone in the text -> the system local zone.
 * - An unknown timezone -> falls back to the system local zone.
 * - If today's occurrence has already passed, the next day is used.
 * Returns null when no valid clock time is found.
 */
export function parseResetTime(text: string, now: Date): number | null {
  const m = TIME_RE.exec(text);
  if (!m) return null;

  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]!.toLowerCase();
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (hour === 12) hour = 0;
  if (meridiem === 'p') hour += 12;

  const tzMatch = TZ_RE.exec(text);
  const zone = tzMatch?.[1];

  // Build "now" in the target zone; fall back to local if the zone is unknown.
  let nowDt = zone ? DateTime.fromJSDate(now, { zone }) : DateTime.fromJSDate(now);
  if (!nowDt.isValid) nowDt = DateTime.fromJSDate(now);

  let target = nowDt.set({ hour, minute, second: 0, millisecond: 0 });
  if (target.toMillis() <= nowDt.toMillis()) target = target.plus({ days: 1 });

  return target.toMillis();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aipad/core exec vitest run reset-time-parser`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/reset-time-parser.ts packages/core/tests/reset-time-parser.test.ts
git commit -m "feat(core): add ResetTimeParser for limit reset times"
```

---

## Task 6: `RateLimitDetector` — scan output for the phrase

**Files:**
- Create: `packages/core/src/rate-limit-detector.ts`
- Test: `packages/core/tests/rate-limit-detector.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/rate-limit-detector.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RateLimitDetector } from '../src/rate-limit-detector.js';

const PHRASE = "You've hit your limit";

function collect(detector: RateLimitDetector): string[] {
  const out: string[] = [];
  detector.on('rateLimitDetected', (resetText) => out.push(resetText));
  return out;
}

describe('RateLimitDetector', () => {
  it('emits once when the phrase appears, with trailing context', () => {
    const d = new RateLimitDetector(PHRASE);
    const events = collect(d);
    d.process(Buffer.from(`${PHRASE} · resets 9:30pm (Pacific/Auckland)\n`, 'utf8'));
    expect(events).toHaveLength(1);
    expect(events[0]).toContain('resets 9:30pm');
  });

  it('detects a phrase split across two chunks', () => {
    const d = new RateLimitDetector(PHRASE);
    const events = collect(d);
    d.process(Buffer.from("You've hit ", 'utf8'));
    d.process(Buffer.from('your limit · resets 3pm\n', 'utf8'));
    expect(events).toHaveLength(1);
  });

  it('detects the phrase when ANSI colour codes are interspersed', () => {
    const d = new RateLimitDetector(PHRASE);
    const events = collect(d);
    d.process(Buffer.from(`\x1b[31m${PHRASE}\x1b[0m · resets 8am\n`, 'utf8'));
    expect(events).toHaveLength(1);
  });

  it('does not re-emit while the phrase stays on screen', () => {
    const d = new RateLimitDetector(PHRASE);
    const events = collect(d);
    d.process(Buffer.from(`${PHRASE} · resets 8am\n`, 'utf8'));
    d.process(Buffer.from(`${PHRASE} still here\n`, 'utf8'));
    expect(events).toHaveLength(1);
  });

  it('re-emits after the phrase scrolls out of the window and reappears', () => {
    const d = new RateLimitDetector(PHRASE);
    const events = collect(d);
    d.process(Buffer.from(`${PHRASE} · resets 8am\n`, 'utf8'));
    d.process(Buffer.from('x'.repeat(5000), 'utf8')); // evicts the phrase
    d.process(Buffer.from(`${PHRASE} · resets 9am\n`, 'utf8'));
    expect(events).toHaveLength(2);
  });

  it('emits nothing when detectText is empty', () => {
    const d = new RateLimitDetector('');
    const events = collect(d);
    d.process(Buffer.from(`${PHRASE} · resets 8am\n`, 'utf8'));
    expect(events).toHaveLength(0);
  });

  it('re-arms after setDetectText so an on-screen phrase can trigger', () => {
    const d = new RateLimitDetector('');
    const events = collect(d);
    d.process(Buffer.from(`${PHRASE} · resets 8am\n`, 'utf8'));
    expect(events).toHaveLength(0);
    d.setDetectText(PHRASE);
    d.process(Buffer.from('more output\n', 'utf8'));
    expect(events).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aipad/core exec vitest run rate-limit-detector`
Expected: FAIL — `../src/rate-limit-detector.js` does not exist.

- [ ] **Step 3: Implement `RateLimitDetector`**

Create `packages/core/src/rate-limit-detector.ts`:

```ts
import { EventEmitter } from 'node:events';
import { StringDecoder } from 'node:string_decoder';

/** Max characters of decoded output kept for phrase matching. */
const WINDOW_MAX = 4096;
/** Characters captured after the matched phrase, so the reset time is included. */
const TRAILING_CONTEXT = 200;

/** CSI sequences, OSC sequences, and other single escapes — stripped before matching. */
const ANSI_RE =
  // eslint-disable-next-line no-control-regex
  /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;

export interface RateLimitDetectorEvents {
  rateLimitDetected: (resetText: string) => void;
}

/**
 * Scans a session's PTY output for a configured literal phrase. Maintains a small
 * sliding window of decoded, ANSI-stripped text. Emits `rateLimitDetected` once
 * each time the phrase newly appears (a false->true transition), so a redrawn TUI
 * frame that keeps the phrase on screen does not produce a storm of events.
 */
export class RateLimitDetector extends EventEmitter {
  private readonly decoder = new StringDecoder('utf8');
  private window = '';
  private detectText: string;
  private present = false;

  constructor(detectText: string) {
    super();
    this.detectText = detectText;
  }

  /** Update the phrase. Re-arms detection so a phrase already on screen can trigger. */
  setDetectText(text: string): void {
    if (text === this.detectText) return;
    this.detectText = text;
    this.present = false;
  }

  process(chunk: Buffer): void {
    if (chunk.length === 0) return;
    // StringDecoder keeps multi-byte UTF-8 characters intact across chunk boundaries.
    this.window = (this.window + this.decoder.write(chunk)).slice(-WINDOW_MAX);

    if (!this.detectText) {
      this.present = false;
      return;
    }
    const stripped = this.window.replace(ANSI_RE, '');
    const idx = stripped.indexOf(this.detectText);
    if (idx === -1) {
      this.present = false;
      return;
    }
    if (this.present) return;
    this.present = true;
    const resetText = stripped.slice(idx, idx + this.detectText.length + TRAILING_CONTEXT);
    this.emit('rateLimitDetected', resetText);
  }

  /** Clear state and listeners. Call when the session ends. */
  dispose(): void {
    this.window = '';
    this.present = false;
    this.removeAllListeners();
  }
}

export interface RateLimitDetector {
  on<K extends keyof RateLimitDetectorEvents>(event: K, listener: RateLimitDetectorEvents[K]): this;
  emit<K extends keyof RateLimitDetectorEvents>(
    event: K,
    ...args: Parameters<RateLimitDetectorEvents[K]>
  ): boolean;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aipad/core exec vitest run rate-limit-detector`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rate-limit-detector.ts packages/core/tests/rate-limit-detector.test.ts
git commit -m "feat(core): add RateLimitDetector for limit-phrase scanning"
```

---

## Task 7: `ResumeScheduler` — hold pending resumes, sweep, fire

**Files:**
- Create: `packages/core/src/resume-scheduler.ts`
- Test: `packages/core/tests/resume-scheduler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/resume-scheduler.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeScheduler } from '../src/resume-scheduler.js';

describe('ResumeScheduler', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('fires onDue once the reset time plus grace has passed', () => {
    const fired: string[] = [];
    const s = new ResumeScheduler({
      onDue: (id) => fired.push(id),
      sweepIntervalMs: 1_000,
      graceMs: 100,
    });
    s.schedule('sess-1', Date.now() + 5_000);
    vi.advanceTimersByTime(5_050); // past resetAt, not yet past grace
    expect(fired).toEqual([]);
    vi.advanceTimersByTime(1_000); // crosses resetAt + grace
    expect(fired).toEqual(['sess-1']);
    expect(s.has('sess-1')).toBe(false);
  });

  it('ignores a second schedule for the same session (dedup)', () => {
    const s = new ResumeScheduler({ onDue: () => {}, sweepIntervalMs: 1_000, graceMs: 0 });
    expect(s.schedule('sess-1', Date.now() + 1_000)).toBe(true);
    expect(s.schedule('sess-1', Date.now() + 9_000)).toBe(false);
  });

  it('does not fire a cancelled resume', () => {
    const fired: string[] = [];
    const s = new ResumeScheduler({
      onDue: (id) => fired.push(id),
      sweepIntervalMs: 1_000,
      graceMs: 0,
    });
    s.schedule('sess-1', Date.now() + 2_000);
    expect(s.cancel('sess-1')).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(fired).toEqual([]);
  });

  it('cancelAll returns the cancelled session ids', () => {
    const s = new ResumeScheduler({ onDue: () => {}, sweepIntervalMs: 1_000, graceMs: 0 });
    s.schedule('a', Date.now() + 1_000);
    s.schedule('b', Date.now() + 1_000);
    expect(s.cancelAll().sort()).toEqual(['a', 'b']);
    expect(s.has('a')).toBe(false);
  });

  it('stops sweeping after dispose', () => {
    const fired: string[] = [];
    const s = new ResumeScheduler({
      onDue: (id) => fired.push(id),
      sweepIntervalMs: 1_000,
      graceMs: 0,
    });
    s.schedule('sess-1', Date.now() + 1_000);
    s.dispose();
    vi.advanceTimersByTime(10_000);
    expect(fired).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aipad/core exec vitest run resume-scheduler`
Expected: FAIL — `../src/resume-scheduler.js` does not exist.

- [ ] **Step 3: Implement `ResumeScheduler`**

Create `packages/core/src/resume-scheduler.ts`:

```ts
export interface ResumeSchedulerOptions {
  /** Called with the session id when a pending resume becomes due. */
  onDue: (sessionId: string) => void;
  /** How often the sweep checks pending entries. Default 20s. */
  sweepIntervalMs?: number;
  /** Delay added after the parsed reset time before firing. Default 30s. */
  graceMs?: number;
}

/**
 * Holds one pending resume per session, entirely in memory. A single periodic
 * sweep — not a long-lived setTimeout — fires due entries, which keeps firing
 * robust across OS sleep and clock changes. Pending resumes are never persisted.
 */
export class ResumeScheduler {
  /** sessionId -> resetAt (epoch ms). */
  private readonly pending = new Map<string, number>();
  private readonly onDue: (sessionId: string) => void;
  private readonly graceMs: number;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(opts: ResumeSchedulerOptions) {
    this.onDue = opts.onDue;
    this.graceMs = opts.graceMs ?? 30_000;
    this.timer = setInterval(() => this.sweep(), opts.sweepIntervalMs ?? 20_000);
    // Do not let the sweep keep the Node event loop (or a test run) alive.
    this.timer.unref?.();
  }

  /** Schedule a resume. Returns false if one is already pending for the session. */
  schedule(sessionId: string, resetAt: number): boolean {
    if (this.pending.has(sessionId)) return false;
    this.pending.set(sessionId, resetAt);
    return true;
  }

  /** Cancel a pending resume. Returns true if one was removed. */
  cancel(sessionId: string): boolean {
    return this.pending.delete(sessionId);
  }

  /** Cancel every pending resume; returns the cancelled session ids. */
  cancelAll(): string[] {
    const ids = [...this.pending.keys()];
    this.pending.clear();
    return ids;
  }

  has(sessionId: string): boolean {
    return this.pending.has(sessionId);
  }

  /** Stop the sweep and drop all pending entries. */
  dispose(): void {
    clearInterval(this.timer);
    this.pending.clear();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [sessionId, resetAt] of [...this.pending]) {
      if (resetAt + this.graceMs <= now) {
        this.pending.delete(sessionId);
        this.onDue(sessionId);
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aipad/core exec vitest run resume-scheduler`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/resume-scheduler.ts packages/core/tests/resume-scheduler.test.ts
git commit -m "feat(core): add ResumeScheduler for pending limit resumes"
```

---

## Task 8: Wire `RateLimitDetector` into `Session`

**Files:**
- Modify: `packages/core/src/session.ts:14-19` (events), `:41` (field), `:63-83` (constructor wiring), and add a public method
- Test: `packages/core/tests/session-rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/session-rate-limit.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { homedir, platform } from 'node:os';
import { Session } from '../src/session.js';
import type { Shell } from '@aipad/contracts';

function defaultShell(): Shell {
  if (platform() === 'win32') return 'pwsh';
  if (platform() === 'darwin') return 'zsh';
  return 'bash';
}

describe('Session rate-limit detection', () => {
  let session: Session | null = null;
  afterEach(() => { session?.kill(); session = null; });

  it('re-emits rateLimitDetected when the configured phrase is set and seen', async () => {
    session = new Session('s1', { shell: defaultShell(), cwd: homedir(), cols: 80, rows: 24 });
    session.setRateLimitDetectText('AIPAD-LIMIT-MARKER');
    const seen: string[] = [];
    session.on('rateLimitDetected', (resetText) => seen.push(resetText));

    await new Promise((r) => setTimeout(r, 400)); // flush startup noise
    session.write('echo AIPAD-LIMIT-MARKER resets 9:30pm\r');

    await new Promise((r) => setTimeout(r, 1500));
    expect(seen.some((t) => t.includes('AIPAD-LIMIT-MARKER'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aipad/core exec vitest run session-rate-limit`
Expected: FAIL — `session.setRateLimitDetectText` is not a function.

- [ ] **Step 3: Add the `rateLimitDetected` event to `SessionEvents`**

In `packages/core/src/session.ts`, change the `SessionEvents` interface (currently lines 14-19) to add the new event:

```ts
export interface SessionEvents {
  data: (chunk: Buffer) => void;
  exit: (info: { exitCode: number | null; signal: string | null }) => void;
  titleChanged: (title: string) => void;
  attention: (ev: AttentionEvent) => void;
  rateLimitDetected: (resetText: string) => void;
}
```

- [ ] **Step 4: Import and field the detector**

In `packages/core/src/session.ts`, add the import near the existing `AttentionDetector` import (line 11):

```ts
import { RateLimitDetector } from './rate-limit-detector.js';
```

Add the field next to `private readonly detector` (line 41):

```ts
  private readonly rateLimitDetector = new RateLimitDetector('');
```

- [ ] **Step 5: Wire the detector in the constructor**

In `packages/core/src/session.ts`, immediately after the existing `this.detector.on('attention', ...)` block (ends at line 67), add:

```ts
    this.rateLimitDetector.on('rateLimitDetected', (resetText) => {
      this.emit('rateLimitDetected', resetText);
    });
```

In the `this.pty.onData` callback, after `this.detector.process(buf);`, add:

```ts
      this.rateLimitDetector.process(buf);
```

In the `this.pty.onExit` callback, after `this.detector.dispose();`, add:

```ts
      this.rateLimitDetector.dispose();
```

- [ ] **Step 6: Add the public `setRateLimitDetectText` method**

In `packages/core/src/session.ts`, add this method after `setTitle` (after line 114):

```ts
  /** Update the rate-limit phrase scanned in this session's output. Empty = off. */
  setRateLimitDetectText(text: string): void {
    this.rateLimitDetector.setDetectText(text);
  }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @aipad/core exec vitest run session-rate-limit`
Expected: PASS.

- [ ] **Step 8: Verify nothing else broke**

Run: `pnpm --filter @aipad/core test`
Expected: PASS — all core suites green.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/session.ts packages/core/tests/session-rate-limit.test.ts
git commit -m "feat(core): wire RateLimitDetector into Session"
```

---

## Task 9: Wire scheduling into `SessionManager`

**Files:**
- Modify: `packages/core/src/session-manager.ts` — imports, `SessionManagerEvents`, fields, `create()`, new methods
- Test: `packages/core/tests/session-manager-resume.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/session-manager-resume.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { homedir, platform } from 'node:os';
import { SessionManager } from '../src/session-manager.js';
import type { Shell } from '@aipad/contracts';

function defaultShell(): Shell {
  if (platform() === 'win32') return 'pwsh';
  if (platform() === 'darwin') return 'zsh';
  return 'bash';
}
function newSession(m: SessionManager) {
  return m.create({ shell: defaultShell(), cwd: homedir(), cols: 80, rows: 24 });
}

describe('SessionManager auto-resume', () => {
  let manager: SessionManager;
  beforeEach(() => { manager = new SessionManager(); });
  afterEach(async () => { await manager.closeAll(); });

  it('schedules a resume when an enabled session detects the phrase', () => {
    manager.applyAutoResumeConfig({ enabled: true, detectText: 'P', responseText: 'continue' });
    const scheduled: Array<{ id: string; at: number }> = [];
    manager.on('resumeScheduled', (id, at) => scheduled.push({ id, at }));
    const session = newSession(manager);

    const future = Date.now() + 60 * 60 * 1000;
    // Drive the detector directly: emit a phrase + a time ~1h out.
    const dt = new Date(future);
    const hh = ((dt.getHours() + 11) % 12) + 1;
    const ampm = dt.getHours() < 12 ? 'am' : 'pm';
    session.emit('rateLimitDetected', `P resets ${hh}:${String(dt.getMinutes()).padStart(2, '0')}${ampm}`);

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.id).toBe(session.id);
  });

  it('does not schedule when auto-resume is disabled', () => {
    manager.applyAutoResumeConfig({ enabled: false, detectText: 'P', responseText: 'continue' });
    const scheduled: string[] = [];
    manager.on('resumeScheduled', (id) => scheduled.push(id));
    const session = newSession(manager);
    session.emit('rateLimitDetected', 'P resets 9:30pm');
    expect(scheduled).toEqual([]);
  });

  it('cancelResume removes a pending resume and emits resumeCancelled', () => {
    manager.applyAutoResumeConfig({ enabled: true, detectText: 'P', responseText: 'continue' });
    const cancelled: string[] = [];
    manager.on('resumeCancelled', (id) => cancelled.push(id));
    const session = newSession(manager);
    session.emit('rateLimitDetected', 'P resets 9:30pm');
    manager.cancelResume(session.id);
    expect(cancelled).toEqual([session.id]);
  });

  it('disabling auto-resume cancels all pending resumes', () => {
    manager.applyAutoResumeConfig({ enabled: true, detectText: 'P', responseText: 'continue' });
    const cancelled: string[] = [];
    manager.on('resumeCancelled', (id) => cancelled.push(id));
    const session = newSession(manager);
    session.emit('rateLimitDetected', 'P resets 9:30pm');
    manager.applyAutoResumeConfig({ enabled: false, detectText: 'P', responseText: 'continue' });
    expect(cancelled).toEqual([session.id]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aipad/core exec vitest run session-manager-resume`
Expected: FAIL — `manager.applyAutoResumeConfig` is not a function.

- [ ] **Step 3: Update imports and the events interface**

In `packages/core/src/session-manager.ts`, extend the type import block (lines 3-9) to include `AutoResumeSettings`:

```ts
import type {
  AttentionEvent,
  AutoResumeSettings,
  SessionCreateOptions,
  SessionId,
  SessionInfo,
  SessionKind,
} from '@aipad/contracts';
```

Add two imports below the `Session` import (after line 10):

```ts
import { ResumeScheduler } from './resume-scheduler.js';
import { parseResetTime } from './reset-time-parser.js';
```

Extend `SessionManagerEvents` (lines 12-18) with three events:

```ts
export interface SessionManagerEvents {
  sessionCreated: (info: SessionInfo) => void;
  sessionData: (sessionId: SessionId, chunk: Buffer) => void;
  sessionExited: (sessionId: SessionId, exitCode: number | null, signal: string | null) => void;
  sessionTitleChanged: (sessionId: SessionId, title: string) => void;
  sessionAttention: (ev: AttentionEvent) => void;
  resumeScheduled: (sessionId: SessionId, resetAt: number) => void;
  resumeCancelled: (sessionId: SessionId) => void;
  resumeFired: (sessionId: SessionId) => void;
}
```

- [ ] **Step 4: Add fields**

In `packages/core/src/session-manager.ts`, after the `sessions` field (line 26), add:

```ts
  private autoResume: AutoResumeSettings = { enabled: false, detectText: '', responseText: '' };
  private readonly resumeScheduler = new ResumeScheduler({
    onDue: (sessionId) => this.fireResume(sessionId),
  });
```

- [ ] **Step 5: Wire detection + cleanup into `create()`**

In `packages/core/src/session-manager.ts`, inside `create()`, after the existing `session.on('attention', ...)` line, add:

```ts
    session.on('rateLimitDetected', (resetText) => {
      if (!this.autoResume.enabled) return;
      const resetAt = parseResetTime(resetText, new Date());
      if (resetAt == null) return;
      if (this.resumeScheduler.schedule(id, resetAt)) {
        this.emit('resumeScheduled', id, resetAt);
      }
    });
```

In the existing `session.on('exit', ...)` handler inside `create()`, add as its first line:

```ts
      this.resumeScheduler.cancel(id);
```

Still inside `create()`, immediately before `this.emit('sessionCreated', session.info());`, add:

```ts
    session.setRateLimitDetectText(this.autoResume.enabled ? this.autoResume.detectText : '');
```

- [ ] **Step 6: Add the public methods**

In `packages/core/src/session-manager.ts`, add these methods after `close()` (before `closeAll()`):

```ts
  /** Apply auto-resume settings: push the detect phrase to every session and,
   * when disabling, cancel every pending resume. */
  applyAutoResumeConfig(config: AutoResumeSettings): void {
    this.autoResume = config;
    const detect = config.enabled ? config.detectText : '';
    for (const session of this.sessions.values()) {
      session.setRateLimitDetectText(detect);
    }
    if (!config.enabled) {
      for (const sessionId of this.resumeScheduler.cancelAll()) {
        this.emit('resumeCancelled', sessionId);
      }
    }
  }

  /** Cancel a pending resume (user clicked the badge's cancel control). */
  cancelResume(sessionId: SessionId): void {
    if (this.resumeScheduler.cancel(sessionId)) {
      this.emit('resumeCancelled', sessionId);
    }
  }

  /** Invoked by the scheduler when a resume is due: type the response into the tab. */
  private fireResume(sessionId: SessionId): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.info().status === 'exited') return;
    session.write(`${this.autoResume.responseText}\r`);
    this.emit('resumeFired', sessionId);
  }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @aipad/core exec vitest run session-manager-resume`
Expected: PASS — all 4 tests green.

- [ ] **Step 8: Run the whole core suite**

Run: `pnpm --filter @aipad/core test`
Expected: PASS — every core suite green.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/session-manager.ts packages/core/tests/session-manager-resume.test.ts
git commit -m "feat(core): schedule auto-resumes in SessionManager"
```

---

## Task 10: Export the new Core symbols

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add the exports**

In `packages/core/src/index.ts`, append:

```ts
export { SettingsStore } from './settings-store.js';
export { RateLimitDetector } from './rate-limit-detector.js';
export type { RateLimitDetectorEvents } from './rate-limit-detector.js';
export { ResumeScheduler } from './resume-scheduler.js';
export type { ResumeSchedulerOptions } from './resume-scheduler.js';
export { parseResetTime } from './reset-time-parser.js';
```

- [ ] **Step 2: Typecheck and build core**

Run: `pnpm --filter @aipad/core typecheck && pnpm --filter @aipad/core build`
Expected: both succeed; `packages/core/dist/` now contains the new modules.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export auto-resume modules from the barrel"
```

---

## Task 11: Integration test — real PTY, scheduled resume fires

**Files:**
- Test: `tests/integration/auto-resume.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/auto-resume.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homedir, platform } from 'node:os';
import { SessionManager } from '@aipad/core';
import type { Shell } from '@aipad/contracts';

function defaultShell(): Shell {
  if (platform() === 'win32') return 'pwsh';
  if (platform() === 'darwin') return 'zsh';
  return 'bash';
}
async function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('auto-resume + real PTY', () => {
  let manager: SessionManager;
  beforeEach(() => { manager = new SessionManager(); });
  afterEach(async () => { await manager.closeAll(); });

  it('detects the phrase, schedules a resume, and types the response into the PTY', async () => {
    manager.applyAutoResumeConfig({
      enabled: true,
      detectText: 'AIPAD-LIMIT',
      responseText: 'continue',
    });

    const scheduled: string[] = [];
    const fired: string[] = [];
    manager.on('resumeScheduled', (id) => scheduled.push(id));
    manager.on('resumeFired', (id) => fired.push(id));

    const session = manager.create({ shell: defaultShell(), cwd: homedir(), cols: 80, rows: 24 });
    await new Promise((r) => setTimeout(r, 400)); // flush startup noise

    // Print a line containing the phrase and a clock time one minute in the future.
    const dt = new Date(Date.now() + 60_000);
    const hh = ((dt.getHours() + 11) % 12) + 1;
    const ampm = dt.getHours() < 12 ? 'am' : 'pm';
    const clock = `${hh}:${String(dt.getMinutes()).padStart(2, '0')}${ampm}`;
    session.write(`echo AIPAD-LIMIT resets ${clock}\r`);

    await waitFor(() => scheduled.includes(session.id));
    expect(scheduled).toContain(session.id);
  });
});
```

(Note: this test asserts the resume is *scheduled*. Firing is covered by the `ResumeScheduler` unit test with fake timers — an integration test cannot wait 60s+grace.)

- [ ] **Step 2: Run test to verify it fails / passes**

Run: `pnpm --filter @aipad/core build && pnpm --filter @aipad/integration test`
Expected: PASS — `@aipad/core` was built in Task 10, so the test should already pass. If it fails, fix the wiring in Tasks 8–9 before continuing.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/auto-resume.test.ts
git commit -m "test(integration): auto-resume schedules against a real PTY"
```

---

## Task 12: Main-process wiring — settings store, IPC handlers, resume events

**Files:**
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: Import the new symbols**

In `apps/desktop/src/main/index.ts`, change the `@aipad/core` and `@aipad/contracts` imports (lines 5-6) to:

```ts
import { IpcChannel, IpcRouter, SessionManager, SessionStore, SettingsStore } from '@aipad/core';
import type { Shell, SessionInfo, AppSettings } from '@aipad/contracts';
import { AppSettingsSchema } from '@aipad/contracts';
```

- [ ] **Step 2: Construct the SettingsStore and hold current settings**

In `apps/desktop/src/main/index.ts`, after the `sessionStore` construction (line 24), add:

```ts
const settingsStore = new SettingsStore(app.getPath('userData'));
settingsStore.onError((err) => {
  console.warn('[main] settings not saved:', err instanceof Error ? err.message : err);
});
let appSettings: AppSettings = { autoResume: { enabled: false, detectText: '', responseText: '' } };
```

- [ ] **Step 3: Register the settings + resume IPC handlers**

In `apps/desktop/src/main/index.ts`, after the existing `ipcMain.handle(IpcChannel.LayoutDefaultCwd, ...)` block (around line 128), add:

```ts
// IPC: chrome renderer reads the current settings.
ipcMain.handle(IpcChannel.SettingsGet, (): AppSettings => appSettings);

// IPC: chrome renderer saves settings — persist, apply, and echo to renderers.
ipcMain.handle(IpcChannel.SettingsUpdate, (_e, raw): { ok: true } | { error: string } => {
  const parsed = AppSettingsSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.message };
  appSettings = parsed.data;
  void settingsStore.save(appSettings);
  sessionManager.applyAutoResumeConfig(appSettings.autoResume);
  chromeWindow?.webContents.send(IpcChannel.SettingsChanged, appSettings);
  return { ok: true };
});

// IPC: chrome renderer cancels a pending resume (badge cancel control).
ipcMain.handle(IpcChannel.ResumeCancel, (_e, raw): { ok: true } | { error: string } => {
  if (typeof raw !== 'object' || raw === null || typeof (raw as { sessionId?: unknown }).sessionId !== 'string') {
    return { error: 'invalid resume-cancel payload' };
  }
  sessionManager.cancelResume((raw as { sessionId: string }).sessionId);
  return { ok: true };
});

// Forward resume lifecycle events to the chrome renderer for the countdown badge.
sessionManager.on('resumeScheduled', (sessionId, resetAt) => {
  chromeWindow?.webContents.send(IpcChannel.ResumeScheduled, { sessionId, resetAt });
});
sessionManager.on('resumeCancelled', (sessionId) => {
  chromeWindow?.webContents.send(IpcChannel.ResumeCancelled, { sessionId });
});
sessionManager.on('resumeFired', (sessionId) => {
  chromeWindow?.webContents.send(IpcChannel.ResumeFired, { sessionId });
});
```

- [ ] **Step 4: Load settings on startup**

In `apps/desktop/src/main/index.ts`, inside `createChromeWindow()`, immediately before the `bootstrapSessions(...)` call (around line 267), add:

```ts
  // Load persisted settings and apply them before any session is created.
  appSettings = await settingsStore.load();
  sessionManager.applyAutoResumeConfig(appSettings.autoResume);
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @aipad/core build && pnpm -r typecheck`
Expected: PASS — no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/index.ts
git commit -m "feat(desktop): wire SettingsStore and resume IPC into main"
```

---

## Task 13: Add "Settings…" to the View menu

**Files:**
- Modify: `apps/desktop/src/main/app-menu.ts:46-53`

- [ ] **Step 1: Add the menu item**

In `apps/desktop/src/main/app-menu.ts`, change the `viewSubmenu` array so its first entries are:

```ts
  const viewSubmenu: MenuItemConstructorOptions[] = [
    { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => send('openSettings', chromeWindow) },
    { type: 'separator' },
    { label: 'Toggle Sidebar', accelerator: Bindings.toggleSidebar.accelerator, click: () => send('toggleSidebar', chromeWindow) },
    { type: 'separator' },
    { role: 'reload' },
    { role: 'toggleDevTools' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -r typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/app-menu.ts
git commit -m "feat(desktop): add Settings item to the View menu"
```

---

## Task 14: Settings modal dialog (chrome renderer)

**Files:**
- Create: `apps/desktop/src/renderer/chrome/settings-dialog.ts`

- [ ] **Step 1: Create the dialog module**

Create `apps/desktop/src/renderer/chrome/settings-dialog.ts`:

```ts
import type { AppSettings } from '@aipad/contracts';

/**
 * Show the settings modal pre-filled from `current`. Resolves with the new
 * AppSettings on Save, or null on Cancel/Escape. Mirrors new-session-dialog.ts:
 * re-uses the single #dialog-mount element so opening twice never stacks modals.
 */
export function showSettingsDialog(
  mount: HTMLElement,
  current: AppSettings,
): Promise<AppSettings | null> {
  return new Promise((resolve) => {
    mount.innerHTML = '';
    mount.classList.add('open');

    const root = document.createElement('div');
    root.className = 'dialog';
    root.innerHTML = `
      <h2>Settings</h2>
      <label class="checkbox-row">
        <input id="set-enabled" type="checkbox" />
        Auto-resume rate-limited tabs
      </label>
      <label for="set-detect">Text to detect</label>
      <input id="set-detect" type="text" maxlength="200" />
      <label for="set-response">Response to send</label>
      <input id="set-response" type="text" maxlength="200" />
      <div class="actions">
        <button id="set-cancel">Cancel</button>
        <button id="set-save" class="primary">Save</button>
      </div>
    `;
    mount.appendChild(root);

    const enabledEl = root.querySelector<HTMLInputElement>('#set-enabled')!;
    const detectEl = root.querySelector<HTMLInputElement>('#set-detect')!;
    const responseEl = root.querySelector<HTMLInputElement>('#set-response')!;
    const saveEl = root.querySelector<HTMLButtonElement>('#set-save')!;
    const cancelEl = root.querySelector<HTMLButtonElement>('#set-cancel')!;

    enabledEl.checked = current.autoResume.enabled;
    detectEl.value = current.autoResume.detectText;
    responseEl.value = current.autoResume.responseText;
    detectEl.focus();
    detectEl.select();

    const cleanup = (result: AppSettings | null): void => {
      mount.classList.remove('open');
      mount.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };

    function submit(): void {
      const enabled = enabledEl.checked;
      const detectText = detectEl.value.trim();
      const responseText = responseEl.value;
      // When enabled, a non-empty detect phrase is required.
      if (enabled && !detectText) {
        detectEl.focus();
        return;
      }
      cleanup({ autoResume: { enabled, detectText, responseText } });
    }

    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') { ev.preventDefault(); cleanup(null); }
      else if (ev.key === 'Enter' && (ev.target as HTMLElement).tagName !== 'BUTTON') {
        ev.preventDefault();
        submit();
      }
    };
    document.addEventListener('keydown', onKey);

    saveEl.addEventListener('click', submit);
    cancelEl.addEventListener('click', () => cleanup(null));
    mount.addEventListener('click', (ev) => {
      if (ev.target === mount) cleanup(null);
    });
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -r typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/chrome/settings-dialog.ts
git commit -m "feat(desktop): add settings modal dialog"
```

---

## Task 15: Chrome wiring — open Settings, track resume state

**Files:**
- Modify: `apps/desktop/src/renderer/chrome/state.ts:3-10` and `:19-26`
- Modify: `apps/desktop/src/renderer/chrome/layout-manager.ts` — import, event listeners, `openSettings`, `cancelResume`, `upsertSession`, `render`
- Modify: `apps/desktop/src/renderer/chrome/keyboard.ts:72-76`

- [ ] **Step 1: Add `resumeAt` to `SessionState`**

In `apps/desktop/src/renderer/chrome/state.ts`, add a field to `SessionState`:

```ts
export interface SessionState {
  info: SessionInfo;
  attention: boolean;
  /** True when the tab's renderer crashed twice in 60s and stopped auto-recovering. */
  broken: boolean;
  /** Epoch ms when this session entered its current status. */
  statusSinceMs: number;
  /** Epoch ms a pending auto-resume will fire, or null when none is scheduled. */
  resumeAt: number | null;
}
```

(`emptyState()` needs no change — it creates no sessions.)

- [ ] **Step 2: Initialise `resumeAt` in `upsertSession`**

In `apps/desktop/src/renderer/chrome/layout-manager.ts`, in `upsertSession`, the `fresh` object literal must include `resumeAt`:

```ts
      const fresh: SessionState = {
        info,
        attention: false,
        broken: false,
        statusSinceMs: Date.now(),
        resumeAt: null,
      };
```

- [ ] **Step 3: Import the settings dialog + AppSettings type**

In `apps/desktop/src/renderer/chrome/layout-manager.ts`, change the dialog import (line 7) and the contracts type import (line 1):

```ts
import type { SessionId, SessionInfo, AttentionEvent, Shell, AppSettings } from '@aipad/contracts';
```

```ts
import { showNewSessionDialog, showRenameDialog } from './new-session-dialog.js';
import { showSettingsDialog } from './settings-dialog.js';
```

- [ ] **Step 4: Subscribe to resume events**

In `apps/desktop/src/renderer/chrome/layout-manager.ts`, inside `start()`, after the `SessionTabBroken` listener block (ends ~line 85), add:

```ts
    // Auto-resume countdown badge: track the scheduled time per session.
    this.bridge.on(IpcChannel.ResumeScheduled, (raw) => {
      const e = raw as { sessionId: SessionId; resetAt: number };
      const session = this.state.sessions.get(e.sessionId);
      if (!session) return;
      session.resumeAt = e.resetAt;
      this.render();
    });
    this.bridge.on(IpcChannel.ResumeCancelled, (raw) => {
      const e = raw as { sessionId: SessionId };
      const session = this.state.sessions.get(e.sessionId);
      if (!session) return;
      session.resumeAt = null;
      this.render();
    });
    this.bridge.on(IpcChannel.ResumeFired, (raw) => {
      const e = raw as { sessionId: SessionId };
      const session = this.state.sessions.get(e.sessionId);
      if (!session) return;
      session.resumeAt = null;
      this.render();
    });
```

In the same `start()` method, in the existing `SessionExited` listener, after `session.statusSinceMs = Date.now();`, add:

```ts
        session.resumeAt = null;
```

- [ ] **Step 5: Add `openSettings` and `cancelResume` methods**

In `apps/desktop/src/renderer/chrome/layout-manager.ts`, add these methods after `newTab()`:

```ts
  async openSettings(): Promise<void> {
    const mount = document.getElementById('dialog-mount');
    if (!mount) return;
    const current = (await this.bridge.send(IpcChannel.SettingsGet)) as AppSettings;
    void this.bridge.send(IpcChannel.LayoutModal, { open: true });
    let result: AppSettings | null;
    try {
      result = await showSettingsDialog(mount, current);
    } finally {
      void this.bridge.send(IpcChannel.LayoutModal, { open: false });
    }
    if (!result) return;
    await this.bridge.send(IpcChannel.SettingsUpdate, result);
  }

  /** Cancel a pending auto-resume (badge cancel control). */
  cancelResume(sessionId: SessionId): void {
    void this.bridge.send(IpcChannel.ResumeCancel, { sessionId });
    const session = this.state.sessions.get(sessionId);
    if (session) {
      session.resumeAt = null;
      this.render();
    }
  }
```

- [ ] **Step 6: Pass `resumeAt` through `render()`**

In `apps/desktop/src/renderer/chrome/layout-manager.ts`, in `render()`, update the two `.map(...)` calls:

```ts
    const tabs: TabViewModel[] = this.state.tabOrder
      .map((id) => this.state.sessions.get(id))
      .filter((s): s is SessionState => !!s)
      .map((s) => ({ info: s.info, attention: s.attention, broken: s.broken, resumeAt: s.resumeAt }));
    this.tabStrip.render(tabs, this.state.focusedId);

    const rows: SidebarRowVm[] = this.state.tabOrder
      .map((id) => this.state.sessions.get(id))
      .filter((s): s is SessionState => !!s)
      .map((s) => ({ info: s.info, attention: s.attention, statusSinceMs: s.statusSinceMs, resumeAt: s.resumeAt }));
    this.sidebar.render(rows, this.state.focusedId);
```

- [ ] **Step 7: Route the `openSettings` menu action**

In `apps/desktop/src/renderer/chrome/keyboard.ts`, change `routeMenuAction` to handle the non-binding action:

```ts
export function routeMenuAction(manager: LayoutManager, actionId: string): void {
  if (actionId === 'openSettings') {
    void manager.openSettings();
    return;
  }
  const handler = ACTION_HANDLERS[actionId as BindingId];
  if (handler) handler(manager);
}
```

- [ ] **Step 8: Typecheck**

Run: `pnpm -r typecheck`
Expected: FAIL — `TabViewModel` / `SidebarRowVm` do not yet have a `resumeAt` field. This is fixed in Task 16; continue.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/renderer/chrome/state.ts apps/desktop/src/renderer/chrome/layout-manager.ts apps/desktop/src/renderer/chrome/keyboard.ts
git commit -m "feat(desktop): wire Settings dialog and resume state into chrome"
```

---

## Task 16: Countdown badge in TabStrip and Sidebar

**Files:**
- Modify: `apps/desktop/src/renderer/chrome/tab-strip.ts:3-7` and `:25-77`
- Modify: `apps/desktop/src/renderer/chrome/sidebar.ts:3-19` and `:46-83`
- Modify: `apps/desktop/src/renderer/chrome/main.ts:24-35` (wire `onResumeCancel`)
- Modify: `apps/desktop/index.html:6-70` (CSS)

- [ ] **Step 1: Add a clock-formatting helper and badge to TabStrip**

In `apps/desktop/src/renderer/chrome/tab-strip.ts`, add `resumeAt` to `TabViewModel`:

```ts
export interface TabViewModel {
  info: SessionInfo;
  attention: boolean;
  broken: boolean;
  /** Epoch ms a pending auto-resume will fire, or null when none is scheduled. */
  resumeAt: number | null;
}
```

At the bottom of `tab-strip.ts`, add a shared helper:

```ts
/** Format an epoch-ms instant as a short local clock time, e.g. "9:30 PM". */
export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
```

In `TabStrip.render`, after the `title` span is appended (after line 51) and before the `close` span is created, add a display-only badge:

```ts
      if (tab.resumeAt !== null) {
        const badge = document.createElement('span');
        badge.className = 'resume-badge';
        badge.textContent = `⏳ ${formatClock(tab.resumeAt)}`;
        badge.title = 'Auto-resume scheduled';
        el.appendChild(badge);
      }
```

- [ ] **Step 2: Add the badge + cancel control to the Sidebar**

In `apps/desktop/src/renderer/chrome/sidebar.ts`, add `resumeAt` to `SidebarRowVm` and an `onResumeCancel` callback:

```ts
export interface SidebarRowVm {
  info: SessionInfo;
  attention: boolean;
  /** Time the session entered its current status, in epoch ms. */
  statusSinceMs: number;
  /** Epoch ms a pending auto-resume will fire, or null when none is scheduled. */
  resumeAt: number | null;
}
```

```ts
export interface SidebarCallbacks {
  onRowClick: (sessionId: SessionId) => void;
  onToggle: () => void;
  /** Opens the rename modal; the LayoutManager owns the dialog + IPC. */
  onRename: (sessionId: SessionId) => void;
  onDuplicate: (sessionId: SessionId) => void;
  /** Restart an exited tab (fresh shell) or a crashed tab (fresh renderer). */
  onRestart: (sessionId: SessionId) => void;
  onClose: (sessionId: SessionId) => void;
  /** Cancel a pending auto-resume for the session. */
  onResumeCancel: (sessionId: SessionId) => void;
}
```

Add the import of `formatClock` at the top of `sidebar.ts`:

```ts
import { formatClock } from './tab-strip.js';
```

In `Sidebar.render`, inside the row loop after `el.appendChild(content);` and before `el.addEventListener('click', ...)`, add:

```ts
      if (row.resumeAt !== null) {
        const badge = document.createElement('span');
        badge.className = 'resume-badge';
        badge.textContent = `⏳ ${formatClock(row.resumeAt)}`;
        badge.title = 'Auto-resume scheduled';
        const cancel = document.createElement('span');
        cancel.className = 'resume-cancel';
        cancel.textContent = '×';
        cancel.title = 'Cancel auto-resume';
        cancel.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.callbacks.onResumeCancel(row.info.id);
        });
        badge.appendChild(cancel);
        el.appendChild(badge);
      }
```

- [ ] **Step 3: Provide the `onResumeCancel` callback in `main.ts`**

In `apps/desktop/src/renderer/chrome/main.ts`, add `onResumeCancel` to the `Sidebar` `callbacks` object:

```ts
    callbacks: {
      onRowClick: (id) => manager.focus(id),
      onToggle: () => manager.toggleSidebar(),
      onRename: (id) => void manager.renameTab(id),
      onDuplicate: (id) => void manager.duplicateTab(id),
      onRestart: (id) => void manager.restartTab(id),
      onClose: (id) => void manager.closeTab(id),
      onResumeCancel: (id) => manager.cancelResume(id),
    },
```

- [ ] **Step 4: Add the badge CSS**

In `apps/desktop/index.html`, inside the `<style>` block, after the `.tab .title` rule (line 39), add:

```css
      .tab .resume-badge { color: var(--warn); font-size: 10px; margin-left: 4px; white-space: nowrap; }
      .sidebar-row .resume-badge { display: inline-flex; align-items: center; gap: 3px; color: var(--warn); font-size: 10px; margin-left: 6px; }
      .sidebar-row .resume-cancel { color: var(--fg-dim); cursor: pointer; padding: 0 2px; }
      .sidebar-row .resume-cancel:hover { color: var(--fg); }
      .dialog input[type=checkbox] { width: auto; margin-right: 6px; vertical-align: middle; }
      .dialog label.checkbox-row { display: flex; align-items: center; color: var(--fg); margin: 10px 0 4px; }
```

- [ ] **Step 5: Typecheck and build the desktop app**

Run: `pnpm -r typecheck && pnpm --filter @aipad/desktop build`
Expected: PASS — typecheck clean (the Task 15 gap is now closed), build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/chrome/tab-strip.ts apps/desktop/src/renderer/chrome/sidebar.ts apps/desktop/src/renderer/chrome/main.ts apps/desktop/index.html
git commit -m "feat(desktop): show auto-resume countdown badge in tabs and sidebar"
```

---

## Task 17: E2E test — Settings panel persists across restart

**Files:**
- Test: `tests/e2e/settings.spec.ts`

- [ ] **Step 1: Write the E2E test**

Create `tests/e2e/settings.spec.ts`:

```ts
import { _electron as electron, expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('Settings panel saves the response text and it persists across restart', async () => {
  // A stable userData dir shared by both launches, so settings.json survives.
  const userData = mkdtempSync(join(tmpdir(), 'aipad-e2e-settings-'));
  const args = [resolve(__dirname, '../../apps/desktop'), `--user-data-dir=${userData}`];
  const env = { ...process.env, NODE_ENV: 'production' };

  // --- First launch: open Settings, change the response text, save. ---
  let app = await electron.launch({ args, env });
  let chrome = await app.firstWindow();
  await expect(chrome.locator('#tab-strip')).toBeVisible();

  await chrome.evaluate(() => {
    (window as unknown as { __aipadLayout: { openSettings(): void } }).__aipadLayout.openSettings();
  });
  await expect(chrome.locator('#set-response')).toBeVisible();
  await chrome.fill('#set-response', 'resume-now');
  await chrome.click('#set-save');
  await expect(chrome.locator('#dialog-mount.open')).toHaveCount(0);
  await app.close();

  // --- Second launch: settings.json should still hold the new value. ---
  app = await electron.launch({ args, env });
  chrome = await app.firstWindow();
  await expect(chrome.locator('#tab-strip')).toBeVisible();

  const settings = await chrome.evaluate(async () => {
    return (window as unknown as {
      aipad: { send: (c: string) => Promise<unknown> };
    }).aipad.send('core.settings.get');
  });
  expect((settings as { autoResume: { responseText: string } }).autoResume.responseText).toBe('resume-now');

  await app.close();
});
```

- [ ] **Step 2: Build the desktop app and run the E2E test**

Run: `pnpm --filter @aipad/contracts build && pnpm --filter @aipad/core build && pnpm --filter @aipad/desktop build && pnpm --filter @aipad/e2e test settings.spec.ts`
Expected: PASS — the spec is green.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/settings.spec.ts
git commit -m "test(e2e): settings panel persists across restart"
```

---

## Task 18: Full verification pass

- [ ] **Step 1: Typecheck the whole repo**

Run: `pnpm -r typecheck`
Expected: PASS — no type errors.

- [ ] **Step 2: Run all unit + integration tests**

Run: `pnpm test`
Expected: PASS — every package's suite green.

- [ ] **Step 3: Run the full E2E suite**

Run: `pnpm test:e2e`
Expected: PASS — `smoke`, `multi-tab`, `splits`, and `settings` specs all green.

- [ ] **Step 4: Manual smoke check**

Run: `pnpm dev`. In the running app:
1. Open **View → Settings**, confirm the three fields show the defaults, change *Response to send* to `continue` (if not already), Save.
2. In a tab, run a command that prints the detect phrase plus a near-future time, e.g. `echo "You've hit your limit · resets <2-min-from-now>"`.
3. Confirm a `⏳` badge appears on the tab and sidebar row.
4. Confirm the sidebar badge's `×` cancels the badge.
5. Re-trigger, wait for the reset time + ~30s grace, and confirm `continue` is typed into the tab.

- [ ] **Step 5: Final commit (if any manual-check fixes were needed)**

```bash
git add -A
git commit -m "chore: rate-limit auto-resume verification fixes"
```

(If no fixes were needed, skip this step.)

---

## Self-Review Notes

- **Spec coverage:** §5 `SettingsStore` → Task 4; `RateLimitDetector` → Task 6; `ResetTimeParser` → Task 5; `ResumeScheduler` → Task 7; Session/SessionManager wiring → Tasks 8–9. §6 IPC contracts → Tasks 2–3. §7 Settings panel → Tasks 13–15; countdown badge → Tasks 15–16. §8 decisions: luxon → Task 1; sweep/grace defaults baked into `ResumeScheduler` (Task 7); no `SessionStatus` change (confirmed — badge state is separate, Task 15). §9 error handling: no-time → `parseResetTime` returns null, `SessionManager` skips (Task 9); disabled/empty → `applyAutoResumeConfig` (Task 9); corrupt settings file → `SettingsStore` (Task 4). §10 testing → unit Tasks 4–9, integration Task 11, E2E Task 17.
- **Persistence:** pending resumes live only in `ResumeScheduler`'s in-memory `Map`; nothing writes them to disk — matches spec §2.
- **Type consistency:** `AutoResumeSettings` (contracts) is the single config type used by `SessionManager.applyAutoResumeConfig` and the main process. `AppSettings` wraps it and is used by `SettingsStore`, IPC, and the dialog. `formatClock` is defined once in `tab-strip.ts` and imported by `sidebar.ts`. `resumeAt: number | null` is consistent across `SessionState`, `TabViewModel`, and `SidebarRowVm`.
- **Known cross-task gap:** Task 15 step 8 typecheck fails by design (the `resumeAt` field on `TabViewModel`/`SidebarRowVm` is added in Task 16). This is called out explicitly in both tasks.
