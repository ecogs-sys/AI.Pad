# AI.Pad — Stage 1, Plan 3: Splits + Persistence + Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Stage 1 by turning AI.Pad from the Plan 2 multi-tab app into a feature-complete and shippable terminal: splits within a tab, session persistence across restarts, a shell/cwd picker, idle-prompt attention heuristic, tab reorder, sidebar context menu, and cross-platform packaging (NSIS/DMG/AppImage) with auto-update + GitHub Actions CI.

**Architecture:** Splits live entirely in the per-tab `WebContentsView` renderer — a new `SplitContainer` hosts a tree of `TerminalHost` panes. A new `SessionCreateForPane` IPC channel lets the renderer spawn sessions without triggering main's view-creation listener. `SessionStore` persists tab metadata (shell, cwd, title, tab order) to `userData/sessions.json` via atomic temp-file rename. `NewSessionDialog` is a chrome-level modal driven by `LayoutManager.newTab`. `AttentionDetector`'s idle heuristic uses a 1.5 s post-output timer plus prompt-pattern matching. `electron-builder` produces installers; `electron-updater` wires GitHub Releases as the update channel; GitHub Actions runs the unit + integration + E2E matrix on Windows/macOS/Linux.

**Tech Stack:** Continues Plans 1+2 — Electron 33+, electron-vite 2+, TypeScript 5.5+ (strict), pnpm 9+, node-pty 1.0+, @xterm/xterm 5.5+, zod 3.23+, Vitest 2+, Playwright 1.47+. New deps: `electron-builder` ^25, `electron-updater` ^6, `electron-store` is NOT used (we roll our own atomic JSON store for clarity).

**Plan 3 scope:**

- **Splits within a tab** — VS-Code-style horizontal/vertical splits. Each pane is its own session; splits are renderer-side layout.
- **Per-tab shell + cwd picker** (`NewSessionDialog`) — `Ctrl+T` opens a small modal letting you pick shell (pwsh/cmd/bash/wsl/custom) and starting cwd before spawning the new tab.
- **Session persistence** — open tabs (shell, cwd, title, tab order) survive `pnpm dev` restarts and packaged-app relaunches. PTYs respawn fresh; conversation state inside `claude` is not preserved (intentional).
- **Idle-prompt attention heuristic** — `AttentionDetector` adds a 1.5 s post-output timer; when the last line matches a prompt pattern (e.g. ends in `> `, `$ `, `:`), emits an `idle` attention signal with `confidence: 0.7`.
- **Tab drag-reorder** — drag a tab in the strip to reorder.
- **Sidebar context menu** — right-click a sidebar row → close / rename / duplicate.
- **Packaging** — `electron-builder` produces NSIS (Windows), DMG (macOS), and AppImage (Linux) installers.
- **Auto-update** — `electron-updater` checks GitHub Releases for the latest tag; non-blocking install on next quit.
- **Cross-platform CI matrix** — GitHub Actions runs unit + integration tests on Windows, macOS, Linux per PR; E2E on Linux per PR; full matrix on `main`. Build job produces installers for all three OSes on tag push.

**Out of scope for Plan 3 (Stage 2 or later):**

- **Overview tab** (grid view of all sessions) — Stage 2.
- **Themes / settings UI** — Stage 2.
- **Split persistence across restarts** — splits start fresh on relaunch; tabs themselves persist.
- **Code signing certificates** — `electron-builder` config supports signing; obtaining and configuring the certs is the user's responsibility (Apple Developer ID, Windows EV cert).
- **Cloud sync** of layouts.
- **Native agent-protocol integration** — wrapping CLIs only.

**Plan 3 success criteria:**

1. `pnpm dev` opens the app. `Ctrl+T` (or "+") opens a `NewSessionDialog`; pick shell + cwd → new tab spawns with those settings.
2. In a tab, `Ctrl+\` splits horizontally (new pane right); `Ctrl+Shift+\` splits vertically (new pane below). Both panes are independent shells; resizing drags adjusts both.
3. Close the app with two tabs open. Re-launch. Both tabs are re-created (fresh PTYs in the same cwd + shell).
4. In a background tab, run `claude` or any prompt-issuing CLI. After it prints its prompt and goes idle ≥ 1.5 s, the tab badges (`idle` attention signal).
5. Drag a tab in the strip to reorder — order persists across restart.
6. Right-click a sidebar row — context menu offers Close / Rename / Duplicate.
7. `pnpm dist` produces `.exe` (Windows), `.dmg` (macOS), `.AppImage` (Linux) installers in `apps/desktop/release/`.
8. GitHub Actions runs `pnpm test` on Windows / macOS / Linux for every PR; passes.
9. `pnpm test` still passes (~32 + new tests = ~50). `pnpm test:e2e` still passes.

---

## File map for this plan

```
packages/contracts/src/
├── session.ts                       [T1: add TabId type; SessionCreate options grow `internal?` flag is NOT used; pane semantics live renderer-side]
├── ipc.ts                           [T1: add SessionCreateForPane channel; T12: add TerminalAction]
└── persistence.ts                   [NEW T1: PersistedTab + PersistedTabs schemas]

packages/core/src/
├── attention-detector.ts            [T2: add idle heuristic with prompt-pattern + timer]
├── session-store.ts                 [NEW T4: atomic JSON read/write with corrupt-file recovery]
├── ipc-router.ts                    [T8: SessionCreate callback hook; T9: SessionCreateForPane handler]
└── index.ts                         [T2/T4: re-exports]

packages/core/tests/
├── attention-detector.test.ts       [T2: extend with 6 new idle tests]
└── session-store.test.ts            [NEW T4: 8 unit tests with tmp dir]

apps/desktop/src/main/
├── index.ts                         [T3: factor createTabSession; T5: persist on changes; T6: restore on boot; T15: Notification + auto-update wiring]
├── session-bootstrap.ts             [NEW T6: orchestrates restore]
└── auto-update.ts                   [NEW T16: electron-updater wiring]

apps/desktop/src/renderer/chrome/
├── layout-manager.ts                [T8: integrate dialog, T13 reorder, T14 context menu]
├── new-session-dialog.ts            [NEW T7: modal HTML/CSS/JS]
├── tab-strip.ts                     [T13: drag-and-drop reorder]
└── sidebar.ts                       [T14: right-click context menu]

apps/desktop/src/renderer/terminal/
├── main.ts                          [T11: replace single TerminalHost with SplitContainer]
└── split-container.ts               [NEW T10: tree of panes + resize dragging]

apps/desktop/
├── electron-builder.json            [NEW T15: NSIS/DMG/AppImage targets]
├── index.html                       [T7: add modal mount point]
└── package.json                     [T15: dist scripts + electron-builder devDep; T16 electron-updater dep]

.github/workflows/
├── ci.yml                           [NEW T18: test matrix Windows/macOS/Linux]
└── release.yml                      [NEW T19: tag-triggered electron-builder dist]

tests/e2e/
└── splits.spec.ts                   [NEW T17: split + close-pane Playwright]

README.md                            [T20: shortcuts, installer download instructions, persistence note]
```

Total: 6 created + 12 modified files in packages + 6 new + 3 modified files in apps + 2 GitHub Actions + 1 E2E + 1 doc = ~31 file touches. Each task scopes 1–4 files.

---

## Task 1: Contracts extensions for Plan 3

**Files:**
- Modify: `packages/contracts/src/session.ts`
- Modify: `packages/contracts/src/ipc.ts`
- Create: `packages/contracts/src/persistence.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Append to `packages/contracts/src/session.ts`**

After `AttentionEventSchema`, add:

```ts
export const TabIdSchema = z.string().min(1);
export type TabId = z.infer<typeof TabIdSchema>;
```

- [ ] **Step 2: Create `packages/contracts/src/persistence.ts`**

```ts
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
```

- [ ] **Step 3: Extend `packages/contracts/src/ipc.ts`**

In the `IpcChannel` object, add new entries (preserve existing entries):

In Requests:
```ts
  SessionCreateForPane: 'core.session.create-for-pane',
```

Add a new schema after `LayoutSetSidebarWidthPayloadSchema`:

```ts
export const SessionCreateForPanePayloadSchema = z.object({
  shell: ShellSchema,
  cwd: z.string().min(1),
  cols: z.number().int().positive().default(80),
  rows: z.number().int().positive().default(24),
});
```

Make sure `ShellSchema` is imported (it already is via the existing imports).

- [ ] **Step 4: Replace `packages/contracts/src/index.ts`**

```ts
export * from './session.js';
export * from './ipc.js';
export * from './notification.js';
export * from './persistence.js';
```

- [ ] **Step 5: Typecheck and build**

Run: `pnpm --filter @aipad/contracts typecheck && pnpm --filter @aipad/contracts build`
Expected: no errors. `dist/persistence.js` and `.d.ts` exist.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src
git commit -m "feat(contracts): add Plan 3 channels (pane create, dialog) + persistence schema"
```

---

## Task 2: `AttentionDetector` idle heuristic (TDD)

**Files:**
- Modify: `packages/core/src/attention-detector.ts`
- Modify: `packages/core/tests/attention-detector.test.ts`

Plan 2 deferred idle detection. Plan 3 adds it:
- After each chunk, the detector schedules an idle check 1.5 s out (any new chunk resets the timer).
- When the timer fires, check the tail of the recent output against prompt patterns: `[\$#%>:]\s*$` on the last line.
- If matched, emit `{ signal: 'idle', confidence: 0.7, snippet: last-line }`.
- After firing once for a given idle window, suppress until new output arrives.

- [ ] **Step 1: Write failing tests**

Append to `packages/core/tests/attention-detector.test.ts` (inside the existing `describe` block):

```ts
  it('emits idle when output ends in a prompt and timer expires', async () => {
    vi.useFakeTimers();
    try {
      const d = new AttentionDetector();
      const events = collect(d);
      d.process(Buffer.from('PS C:\\Users\\me> '));
      vi.advanceTimersByTime(1600);
      expect(events.some((e) => e.signal === 'idle')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not emit idle when the tail is not prompt-like', async () => {
    vi.useFakeTimers();
    try {
      const d = new AttentionDetector();
      const events = collect(d);
      d.process(Buffer.from('Running tests...\nstill running'));
      vi.advanceTimersByTime(2000);
      expect(events.some((e) => e.signal === 'idle')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets the idle timer on new output', () => {
    vi.useFakeTimers();
    try {
      const d = new AttentionDetector();
      const events = collect(d);
      d.process(Buffer.from('PS> '));
      vi.advanceTimersByTime(1000);
      d.process(Buffer.from('running...'));
      vi.advanceTimersByTime(1000);
      expect(events.some((e) => e.signal === 'idle')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('only emits one idle per quiet window', () => {
    vi.useFakeTimers();
    try {
      const d = new AttentionDetector();
      const events = collect(d);
      d.process(Buffer.from('$ '));
      vi.advanceTimersByTime(5000);
      const idles = events.filter((e) => e.signal === 'idle');
      expect(idles).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-arms after new output then quiet again', () => {
    vi.useFakeTimers();
    try {
      const d = new AttentionDetector();
      const events = collect(d);
      d.process(Buffer.from('% '));
      vi.advanceTimersByTime(1600);
      d.process(Buffer.from('result\n# '));
      vi.advanceTimersByTime(1600);
      const idles = events.filter((e) => e.signal === 'idle');
      expect(idles).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('idle signal has confidence 0.7 and snippet contains the prompt', () => {
    vi.useFakeTimers();
    try {
      const d = new AttentionDetector();
      const events = collect(d);
      d.process(Buffer.from('PS> '));
      vi.advanceTimersByTime(1600);
      const idle = events.find((e) => e.signal === 'idle');
      expect(idle?.confidence).toBe(0.7);
      expect(idle?.snippet).toMatch(/PS> $/);
    } finally {
      vi.useRealTimers();
    }
  });
```

(Add `import { vi } from 'vitest';` to the existing imports if it isn't there yet — Plan 2's NotificationService test added it; this test file may or may not. Check, add only if missing.)

- [ ] **Step 2: Run failing tests**

Run: `pnpm --filter @aipad/core test`
Expected: 12 existing AttentionDetector tests pass; 6 new tests fail.

- [ ] **Step 3: Implement idle heuristic in `packages/core/src/attention-detector.ts`**

Replace the file with:

```ts
import { EventEmitter } from 'node:events';
import { ATTENTION_SNIPPET_MAX_LEN } from '@aipad/contracts';
import type { AttentionEvent, AttentionSignal } from '@aipad/contracts';

const BEL = 0x07;
const OSC_PREFIX = Buffer.from('\x1b]1337;AIPadAttention=', 'utf8');
const PAYLOAD_MAX = ATTENTION_SNIPPET_MAX_LEN;
const IDLE_MS = 1500;
const TAIL_BUFFER_MAX = 512; // Bytes of recent output we keep for prompt-pattern matching.
const PROMPT_PATTERN = /[\$#%>:]\s*$/;

export interface AttentionDetectorEvents {
  attention: (ev: AttentionEvent) => void;
}

/**
 * Byte-stream scanner that emits attention events for terminal BEL (\x07), the AI.Pad
 * OSC escape (\x1b]1337;AIPadAttention=...\x07), and idle prompts (no output for 1.5 s
 * after a prompt-like trailing line).
 */
export class AttentionDetector extends EventEmitter {
  private inOsc = false;
  private oscPayload = '';
  private prefixMatchPos = 0;
  private tailBuffer = '';
  private idleTimer: NodeJS.Timeout | null = null;
  private idleEmittedForCurrentQuiet = false;

  process(chunk: Buffer): void {
    if (chunk.length === 0) return;

    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i]!;

      if (this.inOsc) {
        if (byte === BEL) {
          this.emitEvent('osc', 1, this.oscPayload);
          this.oscPayload = '';
          this.inOsc = false;
        } else if (this.oscPayload.length < PAYLOAD_MAX) {
          this.oscPayload += String.fromCharCode(byte);
        }
        continue;
      }

      if (byte === OSC_PREFIX[this.prefixMatchPos]) {
        this.prefixMatchPos++;
        if (this.prefixMatchPos === OSC_PREFIX.length) {
          this.inOsc = true;
          this.prefixMatchPos = 0;
        }
        continue;
      }

      if (this.prefixMatchPos > 0) {
        this.prefixMatchPos = 0;
        // Re-process this byte from scratch. Safe because prefixMatchPos is now 0, so
        // the `prefixMatchPos > 0` branch above cannot fire on the re-entry — no loop.
        i--;
        continue;
      }

      if (byte === BEL) {
        this.emitEvent('bell', 1);
      }
    }

    // Maintain the tail buffer for idle-prompt heuristic. Append decoded chunk; cap length.
    this.tailBuffer = (this.tailBuffer + chunk.toString('utf8')).slice(-TAIL_BUFFER_MAX);

    // Any new output resets the idle window and re-arms the once-per-quiet emit.
    this.idleEmittedForCurrentQuiet = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.checkIdle(), IDLE_MS);
  }

  private checkIdle(): void {
    if (this.idleEmittedForCurrentQuiet) return;
    if (!PROMPT_PATTERN.test(this.tailBuffer)) return;
    this.idleEmittedForCurrentQuiet = true;
    const lastNewline = this.tailBuffer.lastIndexOf('\n');
    const lastLine = this.tailBuffer.slice(lastNewline + 1);
    const snippet = lastLine.slice(-PAYLOAD_MAX);
    const ev: AttentionEvent = {
      sessionId: '__pending__',
      signal: 'idle',
      confidence: 0.7,
      timestamp: Date.now(),
      ...(snippet ? { snippet } : {}),
    };
    this.emit('attention', ev);
  }

  private emitEvent(signal: AttentionSignal, confidence: number, snippet?: string): void {
    const ev: AttentionEvent = {
      sessionId: '__pending__',
      signal,
      confidence,
      timestamp: Date.now(),
      ...(snippet !== undefined ? { snippet } : {}),
    };
    this.emit('attention', ev);
  }
}

export interface AttentionDetector {
  on<K extends keyof AttentionDetectorEvents>(event: K, listener: AttentionDetectorEvents[K]): this;
  emit<K extends keyof AttentionDetectorEvents>(
    event: K,
    ...args: Parameters<AttentionDetectorEvents[K]>
  ): boolean;
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pnpm --filter @aipad/core test`
Expected: 7 RingBuffer + 18 AttentionDetector (12 existing + 6 new) + 6 NotificationService = 31 tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/attention-detector.ts packages/core/tests/attention-detector.test.ts
git commit -m "feat(core): AttentionDetector idle-prompt heuristic with 1.5s timer + pattern (TDD)"
```

---

## Task 3: Refactor main to decouple session-create from view-create

**Files:**
- Modify: `apps/desktop/src/main/index.ts`

In Plan 2, every `sessionCreated` event spawned a `WebContentsView`. For splits, the terminal renderer needs to spawn additional sessions WITHOUT creating new views — those sessions become panes inside the existing tab's view.

Refactor: replace the module-scope `sessionManager.on('sessionCreated', ...)` listener that creates views with an explicit `createTabSession(opts)` helper. The renderer-driven `SessionCreateForPane` IPC handler (added in T8) creates a session WITHOUT calling that helper.

- [ ] **Step 1: Edit `apps/desktop/src/main/index.ts`**

Find the existing block:

```ts
sessionManager.on('sessionCreated', async (info) => {
  if (!viewManager) return;
  viewManager.create(info.id);
  ipcRouter.subscribe(viewManager.get(info.id)!.webContents);
  const entry = rendererEntry('terminal');
  await viewManager.load(info.id, {
    ...(entry.url ? { url: entry.url } : {}),
    ...(entry.file ? { file: entry.file } : {}),
    query: { sessionId: info.id },
  });
  viewManager.show(info.id);
});
```

Replace with:

```ts
async function createSessionView(sessionId: string): Promise<void> {
  if (!viewManager) return;
  viewManager.create(sessionId);
  ipcRouter.subscribe(viewManager.get(sessionId)!.webContents);
  const entry = rendererEntry('terminal');
  await viewManager.load(sessionId, {
    ...(entry.url ? { url: entry.url } : {}),
    ...(entry.file ? { file: entry.file } : {}),
    query: { sessionId },
  });
  viewManager.show(sessionId);
}

async function createTabSession(opts: Parameters<SessionManager['create']>[0]): Promise<SessionInfo> {
  const session = sessionManager.create(opts);
  await createSessionView(session.id);
  return session.info();
}
```

(Add `import type { SessionManager } from '@aipad/core';` if not already imported as a type — currently it's a value import; the `Parameters<SessionManager['create']>[0]` syntax works fine with a value import.)

Then find:

```ts
ipcMain.handle(IpcChannel.SessionCreateDefault, (): SessionInfo | { error: string } => {
  try {
    const session = sessionManager.create({
      shell: defaultShell(),
      cwd: homedir(),
      cols: 80,
      rows: 24,
    });
    return session.info();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});
```

Replace with:

```ts
ipcMain.handle(IpcChannel.SessionCreateDefault, async (): Promise<SessionInfo | { error: string }> => {
  try {
    return await createTabSession({
      shell: defaultShell(),
      cwd: homedir(),
      cols: 80,
      rows: 24,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});
```

Also update the boot session creation inside `createChromeWindow()`. Find:

```ts
  sessionManager.create({
    shell: defaultShell(),
    cwd: homedir(),
    cols: 80,
    rows: 24,
  });
```

Replace with:

```ts
  await createTabSession({
    shell: defaultShell(),
    cwd: homedir(),
    cols: 80,
    rows: 24,
  });
```

(Boot session creation now uses `createTabSession` instead of bypassing the helper.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @aipad/desktop typecheck`
Expected: clean.

- [ ] **Step 3: Run tests**

Run: `pnpm test && pnpm test:e2e`
Expected: all green (31 unit + 5 integration + 2 E2E = 38).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/index.ts
git commit -m "refactor(desktop): factor createTabSession; ready for pane-creation path"
```

---

## Task 4: `SessionStore` (TDD)

**Files:**
- Create: `packages/core/src/session-store.ts`
- Create: `packages/core/tests/session-store.test.ts`
- Modify: `packages/core/src/index.ts`

`SessionStore` reads/writes `sessions.json` in a directory the caller supplies (in production: Electron's `app.getPath('userData')`). It does atomic writes via temp file + rename, and recovers from corrupt files by renaming the bad file to `sessions.json.broken-<timestamp>` and starting fresh.

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/session-store.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore } from '../src/session-store.js';
import type { PersistedTabs } from '@aipad/contracts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'aipad-store-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const sample: PersistedTabs = {
  version: 1,
  tabs: [
    { tabId: 't1', shell: 'pwsh', cwd: 'C:\\Users\\me', title: 'First' },
    { tabId: 't2', shell: 'bash', cwd: '/home/me' },
  ],
  focusedTabId: 't1',
};

describe('SessionStore', () => {
  it('returns null when no file exists', async () => {
    const store = new SessionStore(dir);
    expect(await store.load()).toBeNull();
  });

  it('writes and reads back a payload', async () => {
    const store = new SessionStore(dir);
    await store.save(sample);
    expect(await store.load()).toEqual(sample);
  });

  it('writes via temp file then rename (atomic)', async () => {
    const store = new SessionStore(dir);
    await store.save(sample);
    // Final file exists.
    expect(existsSync(join(dir, 'sessions.json'))).toBe(true);
    // Temp file does not exist after success.
    const remnants = readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    expect(remnants).toHaveLength(0);
  });

  it('overwrites existing file on subsequent save', async () => {
    const store = new SessionStore(dir);
    await store.save(sample);
    const next: PersistedTabs = { version: 1, tabs: [], focusedTabId: null };
    await store.save(next);
    expect(await store.load()).toEqual(next);
  });

  it('returns null and backs up a corrupt file', async () => {
    const path = join(dir, 'sessions.json');
    writeFileSync(path, '{ this is not json');
    const store = new SessionStore(dir);
    const result = await store.load();
    expect(result).toBeNull();
    expect(existsSync(path)).toBe(false);
    const broken = readdirSync(dir).filter((f) => f.startsWith('sessions.json.broken-'));
    expect(broken).toHaveLength(1);
  });

  it('returns null and backs up when schema does not match', async () => {
    const path = join(dir, 'sessions.json');
    writeFileSync(path, JSON.stringify({ version: 99, tabs: 'not-an-array' }));
    const store = new SessionStore(dir);
    expect(await store.load()).toBeNull();
    const broken = readdirSync(dir).filter((f) => f.startsWith('sessions.json.broken-'));
    expect(broken).toHaveLength(1);
  });

  it('handles repeated saves without race', async () => {
    const store = new SessionStore(dir);
    await Promise.all([store.save(sample), store.save(sample), store.save(sample)]);
    expect(await store.load()).toEqual(sample);
  });

  it('serializes JSON with stable shape (sorted keys not required, but parseable)', async () => {
    const store = new SessionStore(dir);
    await store.save(sample);
    const raw = readFileSync(join(dir, 'sessions.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.tabs).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm --filter @aipad/core test`
Expected: 8 session-store tests fail with "Cannot find module './session-store.js'".

- [ ] **Step 3: Implement `SessionStore`**

Create `packages/core/src/session-store.ts`:

```ts
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { PersistedTabsSchema, type PersistedTabs } from '@aipad/contracts';

const FILE_NAME = 'sessions.json';

/**
 * Reads and writes the persisted tab list. Writes are atomic via temp-file + rename.
 * Reads validate against the Zod schema; corrupt or schema-mismatched files are renamed
 * to <FILE_NAME>.broken-<timestamp> so the app always boots.
 */
export class SessionStore {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly dir: string) {}

  async load(): Promise<PersistedTabs | null> {
    const path = join(this.dir, FILE_NAME);
    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await this.backup(path);
      return null;
    }
    const result = PersistedTabsSchema.safeParse(parsed);
    if (!result.success) {
      await this.backup(path);
      return null;
    }
    return result.data;
  }

  /**
   * Save the payload atomically. Concurrent calls are serialized via a chained promise
   * so two simultaneous writes can't tear the file.
   */
  save(payload: PersistedTabs): Promise<void> {
    this.writeChain = this.writeChain.then(() => this.writeAtomic(payload)).catch(() => {});
    return this.writeChain;
  }

  private async writeAtomic(payload: PersistedTabs): Promise<void> {
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

- [ ] **Step 4: Update `packages/core/src/index.ts`**

Append:

```ts
export { SessionStore } from './session-store.js';
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @aipad/core test`
Expected: 7 RingBuffer + 18 AttentionDetector + 6 NotificationService + 8 SessionStore = 39 tests passing.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/session-store.ts packages/core/src/index.ts packages/core/tests/session-store.test.ts
git commit -m "feat(core): SessionStore atomic JSON read/write with corrupt-file recovery (TDD)"
```

---

## Task 5: Persist tab list on changes

**Files:**
- Modify: `apps/desktop/src/main/index.ts`

Hook the persistence: whenever the tab list changes (session created or session exited), write the current set to disk.

- [ ] **Step 1: Edit `apps/desktop/src/main/index.ts`**

Near the top imports, add:

```ts
import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import { SessionStore } from '@aipad/core';
```

(`app.getPath` is already available; no extra import.)

After `const sessionManager = new SessionManager();` add:

```ts
const sessionStore = new SessionStore(app.getPath('userData'));
const tabMeta = new Map<string, { tabId: string; shell: Shell; cwd: string; title?: string }>();

function snapshotTabs(): { version: 1; tabs: Array<{ tabId: string; shell: Shell; cwd: string; title?: string }>; focusedTabId: string | null } {
  return {
    version: 1,
    tabs: Array.from(tabMeta.values()),
    focusedTabId: focusedSessionId, // chrome's focusedSessionId IS the focused tab's primary session
  };
}

function persistTabs(): void {
  void sessionStore.save(snapshotTabs());
}
```

(Plan 2's `let focusedSessionId: string | null = null;` already exists at module scope — reuse it directly. For Plan 3 a tab and its primary session share the same id when there's only one pane; for persistence we only persist the primary pane.)

Add tracking inside the existing `createTabSession` helper (from T3). Modify it to:

```ts
async function createTabSession(opts: Parameters<SessionManager['create']>[0]): Promise<SessionInfo> {
  const session = sessionManager.create(opts);
  tabMeta.set(session.id, {
    tabId: session.id,
    shell: opts.shell,
    cwd: opts.cwd,
    ...(opts.title ? { title: opts.title } : {}),
  });
  persistTabs();
  await createSessionView(session.id);
  return session.info();
}
```

Modify the existing `sessionExited` listener to also trim `tabMeta`:

```ts
sessionManager.on('sessionExited', (sessionId) => {
  viewManager?.destroy(sessionId);
  crashCounters.delete(sessionId);
  tabMeta.delete(sessionId);
  persistTabs();
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @aipad/desktop typecheck`
Expected: clean.

- [ ] **Step 3: Manual sanity (skip — controller verifies)**

The save behavior is verifiable only via `pnpm dev`; the controller will do it after merge.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/index.ts
git commit -m "feat(desktop): persist tab list on create + exit via SessionStore"
```

---

## Task 6: Restore tabs on boot

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/main/session-bootstrap.ts`

On `whenReady`, before creating the boot session, try `sessionStore.load()`. If a persisted tab list exists, recreate each tab in order. If none, fall back to creating one default tab.

- [ ] **Step 1: Create `apps/desktop/src/main/session-bootstrap.ts`**

```ts
import type { Shell, PersistedTabs } from '@aipad/contracts';
import type { SessionInfo } from '@aipad/contracts';

export interface BootstrapDeps {
  loadPersisted: () => Promise<PersistedTabs | null>;
  createTabSession: (opts: { shell: Shell; cwd: string; cols: number; rows: number; title?: string }) => Promise<SessionInfo>;
  defaultShell: () => Shell;
  defaultCwd: () => string;
}

/**
 * On app start: try to restore persisted tabs; if none, create the default boot tab.
 * Returns the session id that should be focused (first persisted, or the boot tab).
 */
export async function bootstrapSessions(deps: BootstrapDeps): Promise<string | null> {
  const persisted = await deps.loadPersisted();
  if (persisted && persisted.tabs.length > 0) {
    let firstId: string | null = null;
    for (const tab of persisted.tabs) {
      const info = await deps.createTabSession({
        shell: tab.shell,
        cwd: tab.cwd,
        cols: 80,
        rows: 24,
        ...(tab.title ? { title: tab.title } : {}),
      });
      if (firstId === null) firstId = info.id;
    }
    return persisted.focusedTabId ?? firstId;
  }
  const boot = await deps.createTabSession({
    shell: deps.defaultShell(),
    cwd: deps.defaultCwd(),
    cols: 80,
    rows: 24,
  });
  return boot.id;
}
```

- [ ] **Step 2: Wire bootstrap into `apps/desktop/src/main/index.ts`**

Add the import:

```ts
import { bootstrapSessions } from './session-bootstrap.js';
```

Inside `createChromeWindow()`, replace the existing `await createTabSession({...})` boot-session block with:

```ts
  await bootstrapSessions({
    loadPersisted: () => sessionStore.load(),
    createTabSession: (opts) => createTabSession(opts),
    defaultShell,
    defaultCwd: () => homedir(),
  });
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aipad/desktop typecheck`
Expected: clean.

- [ ] **Step 4: Run tests**

Run: `pnpm test && pnpm test:e2e`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/index.ts apps/desktop/src/main/session-bootstrap.ts
git commit -m "feat(desktop): restore persisted tabs on app boot"
```

---

## Task 7: `NewSessionDialog` DOM component

**Files:**
- Modify: `apps/desktop/index.html`
- Create: `apps/desktop/src/renderer/chrome/new-session-dialog.ts`

A modal dialog with shell dropdown + cwd input + "Open" / "Cancel" buttons. Mounted into a hidden `<div id="dialog-mount">` in `index.html`.

- [ ] **Step 1: Edit `apps/desktop/index.html`** — add dialog mount + CSS

After the `#sidebar-list` row CSS (around `body.sidebar-collapsed` rules), append:

```css
      #dialog-mount { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.55); z-index: 100; }
      #dialog-mount.open { display: flex; }
      .dialog { background: var(--bg-elev); padding: 18px 22px; border-radius: 6px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); min-width: 360px; font-size: 12px; }
      .dialog h2 { margin: 0 0 14px; font-size: 14px; font-weight: 600; }
      .dialog label { display: block; margin: 10px 0 4px; color: var(--fg-dim); }
      .dialog select, .dialog input { width: 100%; padding: 6px 8px; background: var(--bg); color: var(--fg); border: 1px solid #333; border-radius: 4px; font-family: inherit; font-size: 12px; box-sizing: border-box; }
      .dialog .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
      .dialog button { padding: 6px 14px; background: #2d2d2d; color: var(--fg); border: 1px solid #333; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 12px; }
      .dialog button.primary { background: #094771; border-color: #094771; }
      .dialog button:hover { background: #3a3a3a; }
      .dialog button.primary:hover { background: #0b5a8e; }
```

Replace the `</body>` closing block to include the mount point before the `<script>` tag:

```html
    <div id="dialog-mount"></div>
    <script type="module" src="/src/renderer/chrome/main.ts"></script>
```

- [ ] **Step 2: Create `apps/desktop/src/renderer/chrome/new-session-dialog.ts`**

```ts
import type { Shell } from '@aipad/contracts';

export interface NewSessionResult {
  shell: Shell;
  cwd: string;
}

export interface NewSessionDialogOptions {
  defaultShell: Shell;
  defaultCwd: string;
}

/**
 * Show a modal dialog and resolve with the user's choice, or null if they cancel.
 * Re-uses a single mount element so opening twice doesn't stack modals.
 */
export function showNewSessionDialog(
  mount: HTMLElement,
  opts: NewSessionDialogOptions,
): Promise<NewSessionResult | null> {
  return new Promise((resolve) => {
    mount.innerHTML = '';
    mount.classList.add('open');

    const root = document.createElement('div');
    root.className = 'dialog';
    root.innerHTML = `
      <h2>New tab</h2>
      <label for="ns-shell">Shell</label>
      <select id="ns-shell">
        <option value="pwsh">PowerShell 7 (pwsh)</option>
        <option value="powershell">Windows PowerShell</option>
        <option value="cmd">Command Prompt</option>
        <option value="bash">bash</option>
        <option value="zsh">zsh</option>
        <option value="wsl">WSL</option>
      </select>
      <label for="ns-cwd">Working directory</label>
      <input id="ns-cwd" type="text" />
      <div class="actions">
        <button id="ns-cancel">Cancel</button>
        <button id="ns-open" class="primary">Open</button>
      </div>
    `;
    mount.appendChild(root);

    const shellEl = root.querySelector<HTMLSelectElement>('#ns-shell')!;
    const cwdEl = root.querySelector<HTMLInputElement>('#ns-cwd')!;
    const openEl = root.querySelector<HTMLButtonElement>('#ns-open')!;
    const cancelEl = root.querySelector<HTMLButtonElement>('#ns-cancel')!;

    shellEl.value = opts.defaultShell;
    cwdEl.value = opts.defaultCwd;
    cwdEl.focus();
    cwdEl.select();

    const cleanup = (result: NewSessionResult | null): void => {
      mount.classList.remove('open');
      mount.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };

    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') { ev.preventDefault(); cleanup(null); }
      else if (ev.key === 'Enter' && (ev.target as HTMLElement).tagName !== 'BUTTON') {
        ev.preventDefault();
        submit();
      }
    };
    document.addEventListener('keydown', onKey);

    function submit(): void {
      const shell = shellEl.value as Shell;
      const cwd = cwdEl.value.trim();
      if (!cwd) return;
      cleanup({ shell, cwd });
    }

    openEl.addEventListener('click', submit);
    cancelEl.addEventListener('click', () => cleanup(null));
    mount.addEventListener('click', (ev) => {
      if (ev.target === mount) cleanup(null);
    });
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aipad/desktop typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/index.html apps/desktop/src/renderer/chrome/new-session-dialog.ts
git commit -m "feat(chrome): NewSessionDialog modal (shell dropdown + cwd input)"
```

---

## Task 8: Wire dialog to `LayoutManager.newTab` + main handler

**Files:**
- Modify: `apps/desktop/src/renderer/chrome/main.ts`
- Modify: `apps/desktop/src/renderer/chrome/layout-manager.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `packages/core/src/ipc-router.ts`

`Ctrl+T` and the "+" button now open `NewSessionDialog`. On confirm, the chrome calls a new IPC channel `core.session.create` (the existing `SessionCreate` in contracts, finally wired through `createTabSession` in main).

- [ ] **Step 1: Edit `packages/core/src/ipc-router.ts`** — switch the existing SessionCreate handler to use a callback hook

Find:

```ts
this.ipcMain.handle(IpcChannel.SessionCreate, (_e, raw): SessionInfo | { error: string } => {
  const parsed = SessionCreateOptionsSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.message };
  try {
    return this.manager.create(parsed.data).info();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});
```

Replace with an async + callback-hook version:

```ts
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
```

Add the callback field + setter (alongside the existing `layoutShowCallback`):

```ts
export type SessionCreateCallback = (opts: SessionCreateOptions) => Promise<SessionInfo>;
```

And inside the class:

```ts
  private sessionCreateCallback: SessionCreateCallback | null = null;

  onSessionCreate(cb: SessionCreateCallback): void {
    this.sessionCreateCallback = cb;
  }
```

(Add `import type { SessionCreateOptions } from '@aipad/contracts';` to the existing type imports.)

- [ ] **Step 2: Edit `apps/desktop/src/main/index.ts`** — wire SessionCreate to createTabSession

After the existing `ipcRouter.onLayoutShow(...)` block, add:

```ts
ipcRouter.onSessionCreate((opts) => createTabSession(opts));
```

- [ ] **Step 3: Edit `apps/desktop/src/renderer/chrome/layout-manager.ts`** — add `openNewTabDialog` action that prompts then sends SessionCreate

Add the import:

```ts
import { showNewSessionDialog } from './new-session-dialog.js';
```

Add a new public action method to `LayoutManager` (place after `newTab`):

```ts
async openNewTabDialog(): Promise<void> {
  const mount = document.getElementById('dialog-mount');
  if (!mount) return;
  const result = await showNewSessionDialog(mount, {
    defaultShell: this.platformDefaultShell(),
    defaultCwd: this.platformDefaultCwd(),
  });
  if (!result) return;
  const info = (await this.bridge.send(IpcChannel.SessionCreate, {
    shell: result.shell,
    cwd: result.cwd,
    cols: 80,
    rows: 24,
  })) as SessionInfo | { error: string };
  if ('error' in info) {
    console.error('[chrome] new tab failed:', info.error);
  }
}

private platformDefaultShell(): Shell {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'pwsh';
  if (ua.includes('Mac OS')) return 'zsh';
  return 'bash';
}

private platformDefaultCwd(): string {
  // Chrome renderer can't read $HOME directly; fall back to the last-used cwd from state,
  // otherwise '~' which the platform shell will expand.
  for (const session of this.state.sessions.values()) {
    if (session.info.cwd) return session.info.cwd;
  }
  return '~';
}
```

(Add `import type { Shell } from '@aipad/contracts';` to the type imports.)

Replace `newTab()` to delegate to the dialog action:

```ts
async newTab(): Promise<void> {
  await this.openNewTabDialog();
}
```

(The existing keyboard handler in `keyboard.ts` already maps `newTab` to `manager.newTab()`. No further change needed.)

- [ ] **Step 4: Typecheck + tests**

Run: `pnpm --filter @aipad/desktop typecheck && pnpm test:e2e`
Expected: clean typecheck. E2E may need updating — the smoke test creates a new tab via the `+` button click → modal appears → need to handle. For now: edit `tests/e2e/multi-tab.spec.ts` to click `+` then submit the dialog. Find the existing `await chrome.locator('#new-tab').click();` line and after it add:

```ts
  // NewSessionDialog appears; accept defaults.
  await chrome.locator('#ns-open').click();
```

Re-run `pnpm --filter @aipad/desktop build && pnpm test:e2e`. Expect green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ipc-router.ts apps/desktop/src/main/index.ts apps/desktop/src/renderer/chrome/layout-manager.ts tests/e2e/multi-tab.spec.ts
git commit -m "feat(chrome): NewSessionDialog drives Ctrl+T/+ via SessionCreate IPC"
```

---

## Task 9: `SessionCreateForPane` IPC handler in main

**Files:**
- Modify: `packages/core/src/ipc-router.ts`
- Modify: `apps/desktop/src/main/index.ts`

The terminal renderer (T11 SplitContainer) calls this to spawn a session for a new pane — without triggering view creation.

- [ ] **Step 1: Edit `packages/core/src/ipc-router.ts`** — add handler

In `bindRequests()`, after the existing `SessionCreate` handler, add:

```ts
this.ipcMain.handle(IpcChannel.SessionCreateForPane, (_e, raw): SessionInfo | { error: string } => {
  const parsed = SessionCreateForPanePayloadSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.message };
  try {
    // Note: NO view creation — this session lives as a pane inside the calling renderer.
    return this.manager.create(parsed.data).info();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});
```

Add `SessionCreateForPanePayloadSchema` to the existing value imports from `@aipad/contracts`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @aipad/core typecheck && pnpm --filter @aipad/desktop typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/ipc-router.ts
git commit -m "feat(core): SessionCreateForPane IPC — creates session without view"
```

---

## Task 10: `SplitContainer` DOM component

**Files:**
- Create: `apps/desktop/src/renderer/terminal/split-container.ts`

A binary tree of split nodes. Each leaf is a TerminalHost; each branch has an orientation (horizontal / vertical), two children, and a divider position (0..1).

The container renders DOM splits using flexbox + a draggable divider. Pane creation calls `core.session.create-for-pane` to get a new sessionId. Pane close ends the session.

- [ ] **Step 1: Create `apps/desktop/src/renderer/terminal/split-container.ts`**

```ts
import { TerminalHost, type PreloadBridge } from '@aipad/terminal-host';
import type { SessionId, Shell } from '@aipad/contracts';
import { IpcChannel } from '@aipad/contracts';

type Orientation = 'horizontal' | 'vertical';

interface LeafNode {
  kind: 'leaf';
  sessionId: SessionId;
  host: TerminalHost;
  el: HTMLElement;
}

interface BranchNode {
  kind: 'branch';
  orientation: Orientation;
  ratio: number; // 0..1
  a: SplitNode;
  b: SplitNode;
  el: HTMLElement;
}

type SplitNode = LeafNode | BranchNode;

export interface SplitContainerOptions {
  rootEl: HTMLElement;
  bridge: PreloadBridge;
  initialSessionId: SessionId;
  shell: Shell;
  cwd: string;
}

export class SplitContainer {
  private root: SplitNode;
  private focused: LeafNode;
  private readonly bridge: PreloadBridge;
  private readonly shell: Shell;
  private readonly cwd: string;
  private readonly rootEl: HTMLElement;

  constructor(opts: SplitContainerOptions) {
    this.bridge = opts.bridge;
    this.shell = opts.shell;
    this.cwd = opts.cwd;
    this.rootEl = opts.rootEl;
    const leafEl = this.makePaneElement();
    this.rootEl.appendChild(leafEl);
    const host = new TerminalHost({ container: leafEl, sessionId: opts.initialSessionId, bridge: this.bridge });
    this.root = { kind: 'leaf', sessionId: opts.initialSessionId, host, el: leafEl };
    this.focused = this.root;
    leafEl.addEventListener('focusin', () => { if (this.root.kind === 'leaf') this.focused = this.root; });
  }

  async splitFocused(orientation: Orientation): Promise<void> {
    const oldFocused = this.focused;
    const newSessionInfo = await this.bridge.send(IpcChannel.SessionCreateForPane, {
      shell: this.shell,
      cwd: this.cwd,
      cols: 80,
      rows: 24,
    }) as { id: string } | { error: string };
    if ('error' in newSessionInfo) {
      console.error('[split] create pane failed:', newSessionInfo.error);
      return;
    }
    const newSessionId = newSessionInfo.id as SessionId;

    const branchEl = document.createElement('div');
    branchEl.style.display = 'flex';
    branchEl.style.flexDirection = orientation === 'horizontal' ? 'row' : 'column';
    branchEl.style.width = '100%';
    branchEl.style.height = '100%';

    const newLeafEl = this.makePaneElement();
    const divider = document.createElement('div');
    divider.style.background = '#333';
    divider.style.flex = '0 0 4px';
    divider.style.cursor = orientation === 'horizontal' ? 'col-resize' : 'row-resize';

    oldFocused.el.parentElement?.replaceChild(branchEl, oldFocused.el);
    oldFocused.el.style.flex = '1 1 50%';
    newLeafEl.style.flex = '1 1 50%';
    branchEl.appendChild(oldFocused.el);
    branchEl.appendChild(divider);
    branchEl.appendChild(newLeafEl);

    const newHost = new TerminalHost({ container: newLeafEl, sessionId: newSessionId, bridge: this.bridge });
    const newLeaf: LeafNode = { kind: 'leaf', sessionId: newSessionId, host: newHost, el: newLeafEl };

    const branch: BranchNode = {
      kind: 'branch',
      orientation,
      ratio: 0.5,
      a: oldFocused,
      b: newLeaf,
      el: branchEl,
    };
    // Replace the old leaf in the tree with the new branch.
    this.root = this.replaceInTree(this.root, oldFocused, branch) ?? branch;

    this.wireDivider(branch, divider);

    this.focused = newLeaf;
    newLeafEl.addEventListener('focusin', () => { this.focused = newLeaf; });
    newHost.dispose;  // referenced; do not actually call yet
  }

  private wireDivider(branch: BranchNode, divider: HTMLElement): void {
    let dragging = false;
    divider.addEventListener('mousedown', () => { dragging = true; });
    document.addEventListener('mouseup', () => { dragging = false; });
    document.addEventListener('mousemove', (ev) => {
      if (!dragging) return;
      const rect = branch.el.getBoundingClientRect();
      const ratio = branch.orientation === 'horizontal'
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height;
      const clamped = Math.max(0.1, Math.min(0.9, ratio));
      branch.ratio = clamped;
      branch.a.el.style.flex = `1 1 ${clamped * 100}%`;
      branch.b.el.style.flex = `1 1 ${(1 - clamped) * 100}%`;
    });
  }

  private replaceInTree(node: SplitNode, target: SplitNode, replacement: SplitNode): SplitNode | null {
    if (node === target) return replacement;
    if (node.kind === 'leaf') return null;
    const a = this.replaceInTree(node.a, target, replacement);
    if (a) { node.a = a; return node; }
    const b = this.replaceInTree(node.b, target, replacement);
    if (b) { node.b = b; return node; }
    return null;
  }

  private makePaneElement(): HTMLElement {
    const el = document.createElement('div');
    el.style.flex = '1 1 100%';
    el.style.minWidth = '0';
    el.style.minHeight = '0';
    el.style.height = '100%';
    el.tabIndex = 0;
    return el;
  }

  getFocusedSessionId(): SessionId {
    return this.focused.sessionId;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @aipad/desktop typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/terminal/split-container.ts
git commit -m "feat(terminal): SplitContainer tree of TerminalHost panes with draggable dividers"
```

---

## Task 11: Terminal renderer hosts `SplitContainer`

**Files:**
- Modify: `apps/desktop/src/renderer/terminal/main.ts`
- Modify: `apps/desktop/src/main/index.ts`

Replace the single TerminalHost with a SplitContainer. Pass shell+cwd along to the renderer so new panes can be created with the same context.

- [ ] **Step 1: Edit `apps/desktop/src/main/index.ts`** — pass shell+cwd in the query

Find the `createSessionView` helper. Update the `query` to include shell + cwd:

```ts
async function createSessionView(sessionId: string): Promise<void> {
  if (!viewManager) return;
  viewManager.create(sessionId);
  ipcRouter.subscribe(viewManager.get(sessionId)!.webContents);
  const entry = rendererEntry('terminal');
  const meta = tabMeta.get(sessionId);
  await viewManager.load(sessionId, {
    ...(entry.url ? { url: entry.url } : {}),
    ...(entry.file ? { file: entry.file } : {}),
    query: {
      sessionId,
      shell: meta?.shell ?? defaultShell(),
      cwd: meta?.cwd ?? homedir(),
    },
  });
  viewManager.show(sessionId);
}
```

- [ ] **Step 2: Replace `apps/desktop/src/renderer/terminal/main.ts`**

```ts
import type { PreloadBridge } from '@aipad/terminal-host';
import type { SessionId, Shell } from '@aipad/contracts';
import { SplitContainer } from './split-container.js';

const container = document.getElementById('term-root');
if (!container) throw new Error('#term-root not found in terminal-host.html');

const bridge = (window as unknown as { aipad: PreloadBridge }).aipad;

const params = new URLSearchParams(window.location.search);
const sessionId = params.get('sessionId') as SessionId | null;
const shell = (params.get('shell') ?? 'pwsh') as Shell;
const cwd = params.get('cwd') ?? '~';
if (!sessionId) throw new Error('terminal-host.html opened without ?sessionId=...');

const splits = new SplitContainer({
  rootEl: container,
  bridge,
  initialSessionId: sessionId,
  shell,
  cwd,
});

// Expose for keyboard / split shortcuts.
(window as unknown as { __aipadSplits: SplitContainer }).__aipadSplits = splits;

console.info('[terminal] split container mounted; primary session', sessionId);
```

- [ ] **Step 3: Build packages + typecheck**

Run: `pnpm -r --filter './packages/*' build && pnpm --filter @aipad/desktop typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/index.ts apps/desktop/src/renderer/terminal/main.ts
git commit -m "feat(terminal): renderer hosts SplitContainer; main forwards shell+cwd"
```

---

## Task 12: Split keyboard shortcuts

**Files:**
- Modify: `packages/keymap/src/index.ts`
- Modify: `apps/desktop/src/main/app-menu.ts`
- Modify: `apps/desktop/src/renderer/terminal/main.ts`
- Modify: `packages/contracts/src/ipc.ts`

`Ctrl+\` splits the focused pane horizontally; `Ctrl+Shift+\` splits vertically. Since splits live in the terminal renderer (not the chrome), the chrome's keyboard handler can't reach them directly. We re-use the existing `ActionInvoke` event channel BUT route split actions through main to the FOCUSED terminal view.

- [ ] **Step 1: Add bindings to `packages/keymap/src/index.ts`**

Append two new entries to `Bindings`:

```ts
  splitHorizontal: { id: 'splitHorizontal', description: 'Split horizontally', accelerator: 'CmdOrCtrl+\\' },
  splitVertical:   { id: 'splitVertical',   description: 'Split vertically',   accelerator: 'CmdOrCtrl+Shift+\\' },
```

- [ ] **Step 2: Add to `packages/contracts/src/ipc.ts`** — a new event channel for the terminal view

In the Events section of `IpcChannel`:

```ts
  TerminalAction: 'event.terminal.action',
```

Add payload schema:

```ts
export const TerminalActionPayloadSchema = z.object({
  action: z.enum(['splitHorizontal', 'splitVertical']),
});
```

- [ ] **Step 3: Update `apps/desktop/src/main/app-menu.ts`** — route split actions to the FOCUSED terminal view

In the existing Tabs submenu, append:

```ts
    { type: 'separator' },
    { label: 'Split Horizontally', accelerator: Bindings.splitHorizontal.accelerator, click: () => sendTerminal('splitHorizontal', getActiveTerminalView) },
    { label: 'Split Vertically',   accelerator: Bindings.splitVertical.accelerator,   click: () => sendTerminal('splitVertical', getActiveTerminalView) },
```

Change `buildAppMenu` to accept an additional callback for finding the focused view, and add the helper:

```ts
import type { WebContentsView } from 'electron';
import { IpcChannel } from '@aipad/contracts';

export function buildAppMenu(
  chromeWindow: () => BrowserWindow | null,
  getActiveTerminalView: () => WebContentsView | null,
): Menu {
  function sendTerminal(action: 'splitHorizontal' | 'splitVertical', getView: () => WebContentsView | null): void {
    const view = getView();
    view?.webContents.send(IpcChannel.TerminalAction, { action });
  }
  // ... existing body ...
}
```

(Update the rest of the file accordingly — the `Bindings` import already covers split entries via the keymap change in Step 1.)

- [ ] **Step 4: Update `apps/desktop/src/main/index.ts`** — pass the active-terminal getter

When calling `buildAppMenu(...)`, change the line:

```ts
  Menu.setApplicationMenu(buildAppMenu(() => chromeWindow));
```

to:

```ts
  Menu.setApplicationMenu(buildAppMenu(
    () => chromeWindow,
    () => focusedSessionId ? (viewManager?.get(focusedSessionId) ?? null) : null,
  ));
```

- [ ] **Step 5: Add no-op chrome handlers for the new bindings**

Because `ACTION_HANDLERS` in `apps/desktop/src/renderer/chrome/keyboard.ts` is typed `Record<BindingId, ...>`, adding `splitHorizontal` / `splitVertical` to `Bindings` requires matching entries — even though the split actions route through the terminal view (TerminalAction event), not through the chrome's keydown listener.

In `apps/desktop/src/renderer/chrome/keyboard.ts`, add to `ACTION_HANDLERS`:

```ts
  splitHorizontal: () => { /* routed through Electron menu → TerminalAction event */ },
  splitVertical:   () => { /* same */ },
```

- [ ] **Step 6: Update `apps/desktop/src/renderer/terminal/main.ts`** — listen for TerminalAction events

After the SplitContainer construction, add:

```ts
import { IpcChannel } from '@aipad/contracts';

bridge.on(IpcChannel.TerminalAction, (raw) => {
  const e = raw as { action: 'splitHorizontal' | 'splitVertical' };
  if (e.action === 'splitHorizontal') void splits.splitFocused('horizontal');
  else if (e.action === 'splitVertical') void splits.splitFocused('vertical');
});
```

- [ ] **Step 7: Build + typecheck**

Run: `pnpm -r --filter './packages/*' build && pnpm --filter @aipad/desktop typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/keymap/src/index.ts packages/contracts/src/ipc.ts apps/desktop/src/main/app-menu.ts apps/desktop/src/main/index.ts apps/desktop/src/renderer/chrome/keyboard.ts apps/desktop/src/renderer/terminal/main.ts
git commit -m "feat(splits): Ctrl+\\ / Ctrl+Shift+\\ route to focused terminal view"
```

---

## Task 13: Tab drag-reorder

**Files:**
- Modify: `apps/desktop/src/renderer/chrome/tab-strip.ts`
- Modify: `apps/desktop/src/renderer/chrome/layout-manager.ts`

HTML5 drag-and-drop. Tab elements get `draggable="true"`; on `drop`, the LayoutManager updates `tabOrder` and re-renders.

- [ ] **Step 1: Add `onTabReorder` callback to `TabStripCallbacks`**

In `apps/desktop/src/renderer/chrome/tab-strip.ts`, update the interface:

```ts
export interface TabStripCallbacks {
  onTabClick: (sessionId: SessionId) => void;
  onTabClose: (sessionId: SessionId) => void;
  onNewTab: () => void;
  onTabReorder: (sessionId: SessionId, beforeId: SessionId | null) => void;
}
```

In `render()`, set `el.draggable = true;` on each tab. Add drag handlers:

```ts
      el.draggable = true;
      el.addEventListener('dragstart', (ev) => {
        ev.dataTransfer?.setData('text/plain', tab.info.id);
      });
      el.addEventListener('dragover', (ev) => ev.preventDefault());
      el.addEventListener('drop', (ev) => {
        ev.preventDefault();
        const draggedId = ev.dataTransfer?.getData('text/plain') as SessionId | undefined;
        if (!draggedId || draggedId === tab.info.id) return;
        this.callbacks.onTabReorder(draggedId, tab.info.id);
      });
```

- [ ] **Step 2: Implement `LayoutManager.reorderTab`**

In `apps/desktop/src/renderer/chrome/layout-manager.ts`, add the public method (after `closeTab`):

```ts
reorderTab(draggedId: SessionId, beforeId: SessionId | null): void {
  const dragIdx = this.state.tabOrder.indexOf(draggedId);
  if (dragIdx < 0) return;
  const [moved] = this.state.tabOrder.splice(dragIdx, 1);
  if (!moved) return;
  if (beforeId === null) {
    this.state.tabOrder.push(moved);
  } else {
    const beforeIdx = this.state.tabOrder.indexOf(beforeId);
    this.state.tabOrder.splice(beforeIdx, 0, moved);
  }
  this.render();
}
```

In `apps/desktop/src/renderer/chrome/main.ts`, add `onTabReorder` to the TabStrip callbacks:

```ts
  tabStrip: new TabStrip(tabStripEl, {
    onTabClick: (id) => manager.focus(id),
    onTabClose: (id) => void manager.closeTab(id),
    onNewTab: () => void manager.newTab(),
    onTabReorder: (id, before) => manager.reorderTab(id, before),
  }),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aipad/desktop typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/chrome/tab-strip.ts apps/desktop/src/renderer/chrome/layout-manager.ts apps/desktop/src/renderer/chrome/main.ts
git commit -m "feat(chrome): drag-and-drop tab reorder"
```

---

## Task 14: Sidebar context menu

**Files:**
- Modify: `apps/desktop/src/renderer/chrome/sidebar.ts`
- Modify: `apps/desktop/src/renderer/chrome/layout-manager.ts`

Right-click a sidebar row → small menu with Close / Rename / Duplicate. Rename does inline-edit of the title; Duplicate creates a new session with the same shell + cwd; Close calls `closeTab(id)`.

- [ ] **Step 1: Add callbacks to `SidebarCallbacks`**

In `apps/desktop/src/renderer/chrome/sidebar.ts`:

```ts
export interface SidebarCallbacks {
  onRowClick: (sessionId: SessionId) => void;
  onToggle: () => void;
  onRename: (sessionId: SessionId, newTitle: string) => void;
  onDuplicate: (sessionId: SessionId) => void;
  onClose: (sessionId: SessionId) => void;
}
```

In `render()`, attach a `contextmenu` handler to each row:

```ts
      el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        this.showContextMenu(ev.clientX, ev.clientY, row.info.id, row.info.title);
      });
```

Add the helper to the class:

```ts
private showContextMenu(x: number, y: number, sessionId: SessionId, currentTitle: string): void {
  const existing = document.getElementById('sidebar-context-menu');
  existing?.remove();
  const menu = document.createElement('div');
  menu.id = 'sidebar-context-menu';
  menu.style.cssText = `position: fixed; top: ${y}px; left: ${x}px; background: #2d2d2d; color: #d4d4d4; border: 1px solid #333; border-radius: 4px; padding: 4px 0; z-index: 200; font-size: 12px; min-width: 140px; box-shadow: 0 4px 14px rgba(0,0,0,0.4);`;
  const mk = (label: string, fn: () => void) => {
    const item = document.createElement('div');
    item.textContent = label;
    item.style.cssText = 'padding: 6px 14px; cursor: pointer;';
    item.addEventListener('mouseover', () => { item.style.background = '#094771'; });
    item.addEventListener('mouseout', () => { item.style.background = 'transparent'; });
    item.addEventListener('click', () => { menu.remove(); fn(); });
    menu.appendChild(item);
  };
  mk('Rename', () => {
    const newTitle = prompt('Rename tab', currentTitle);
    if (newTitle && newTitle.trim()) this.callbacks.onRename(sessionId, newTitle.trim());
  });
  mk('Duplicate', () => this.callbacks.onDuplicate(sessionId));
  mk('Close', () => this.callbacks.onClose(sessionId));
  document.body.appendChild(menu);
  const dismiss = (ev: MouseEvent): void => {
    if (!menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener('mousedown', dismiss); }
  };
  setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
}
```

- [ ] **Step 2: Implement layout-manager actions**

In `apps/desktop/src/renderer/chrome/layout-manager.ts`, add three public methods (after `reorderTab`):

```ts
renameTab(sessionId: SessionId, newTitle: string): void {
  const session = this.state.sessions.get(sessionId);
  if (!session) return;
  session.info = { ...session.info, title: newTitle };
  this.render();
}

async duplicateTab(sessionId: SessionId): Promise<void> {
  const session = this.state.sessions.get(sessionId);
  if (!session) return;
  const info = (await this.bridge.send(IpcChannel.SessionCreate, {
    shell: session.info.shell,
    cwd: session.info.cwd,
    cols: 80,
    rows: 24,
  })) as SessionInfo | { error: string };
  if ('error' in info) console.error('[chrome] duplicate failed:', info.error);
}
```

(The `closeTab` method already exists.)

In `apps/desktop/src/renderer/chrome/main.ts`, extend the Sidebar callbacks:

```ts
  sidebar: new Sidebar({
    listEl: sidebarListEl,
    toggleEl: sidebarToggleEl,
    callbacks: {
      onRowClick: (id) => manager.focus(id),
      onToggle: () => manager.toggleSidebar(),
      onRename: (id, title) => manager.renameTab(id, title),
      onDuplicate: (id) => void manager.duplicateTab(id),
      onClose: (id) => void manager.closeTab(id),
    },
  }),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aipad/desktop typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/chrome/sidebar.ts apps/desktop/src/renderer/chrome/layout-manager.ts apps/desktop/src/renderer/chrome/main.ts
git commit -m "feat(chrome): sidebar right-click context menu (rename/duplicate/close)"
```

---

## Task 15: `electron-builder` packaging config

**Files:**
- Modify: `apps/desktop/package.json`
- Create: `apps/desktop/electron-builder.json`

- [ ] **Step 1: Create `apps/desktop/electron-builder.json`**

```json
{
  "appId": "com.ecogs.aipad",
  "productName": "AI.Pad",
  "directories": {
    "buildResources": "build",
    "output": "release/${version}"
  },
  "files": [
    "out/**/*",
    "package.json"
  ],
  "asarUnpack": [
    "node_modules/node-pty/**/*"
  ],
  "win": {
    "target": ["nsis"]
  },
  "mac": {
    "target": ["dmg"],
    "category": "public.app-category.developer-tools"
  },
  "linux": {
    "target": ["AppImage"],
    "category": "Development"
  },
  "publish": [
    {
      "provider": "github",
      "owner": "ecogs-sys",
      "repo": "AI.Pad"
    }
  ]
}
```

- [ ] **Step 2: Edit `apps/desktop/package.json`**

Update the existing devDependencies to add electron-builder:

```json
    "electron-builder": "^25.0.0",
```

Add new scripts in the scripts object:

```json
    "dist": "electron-builder --config electron-builder.json",
    "dist:win": "electron-builder --win --config electron-builder.json",
    "dist:mac": "electron-builder --mac --config electron-builder.json",
    "dist:linux": "electron-builder --linux --config electron-builder.json"
```

(Also keep all existing scripts.)

- [ ] **Step 3: Install**

Run: `pnpm install`
Expected: electron-builder pulled.

- [ ] **Step 4: Smoke-test the build on current platform**

Run: `pnpm --filter @aipad/desktop build && pnpm --filter @aipad/desktop dist`
Expected on Windows: produces `apps/desktop/release/0.0.1/AI.Pad Setup 0.0.1.exe` (or similar). The first run downloads electron-builder's tools — may take several minutes.

If it fails for code-signing reasons: add to `apps/desktop/electron-builder.json`:

```json
  "win": { "target": ["nsis"], "signAndEditExecutable": false },
  "mac": { "target": ["dmg"], "identity": null }
```

This skips signing for local dev builds. Production releases (via CI) would supply real certs via env vars.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron-builder.json apps/desktop/package.json pnpm-lock.yaml
git commit -m "chore(desktop): electron-builder NSIS/DMG/AppImage packaging config"
```

---

## Task 16: Auto-update via `electron-updater`

**Files:**
- Modify: `apps/desktop/package.json`
- Create: `apps/desktop/src/main/auto-update.ts`
- Modify: `apps/desktop/src/main/index.ts`

`electron-updater` checks GitHub Releases for newer versions. Non-blocking: downloads in the background, installs on next quit.

- [ ] **Step 1: Add dependency in `apps/desktop/package.json`**

In `dependencies`:

```json
    "electron-updater": "^6.3.0",
```

- [ ] **Step 2: Create `apps/desktop/src/main/auto-update.ts`**

```ts
import { autoUpdater } from 'electron-updater';
import { app } from 'electron';

/**
 * Wire auto-update against GitHub Releases. Quiet behavior: check on startup, download in
 * background, prompt user only when an update is ready to install.
 */
export function setupAutoUpdate(): void {
  if (!app.isPackaged) return; // skip in dev
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => console.warn('[auto-update] error:', err));
  autoUpdater.on('update-available', (info) => console.info('[auto-update] available:', info.version));
  autoUpdater.on('update-downloaded', () => console.info('[auto-update] downloaded; will install on quit'));

  void autoUpdater.checkForUpdates();
}
```

- [ ] **Step 3: Wire into main**

In `apps/desktop/src/main/index.ts`, add the import:

```ts
import { setupAutoUpdate } from './auto-update.js';
```

Inside `createChromeWindow()`, AFTER `new NotificationBridge({...})`, add:

```ts
  setupAutoUpdate();
```

- [ ] **Step 4: Install + typecheck**

Run: `pnpm install && pnpm --filter @aipad/desktop typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/package.json apps/desktop/src/main/auto-update.ts apps/desktop/src/main/index.ts pnpm-lock.yaml
git commit -m "feat(desktop): auto-update via electron-updater against GitHub Releases"
```

---

## Task 17: Playwright E2E — splits

**Files:**
- Create: `tests/e2e/splits.spec.ts`

Open a tab, send Ctrl+\ via main process IPC (the menu accelerator), verify two panes are visible inside the terminal view.

NOTE: Playwright cannot directly access the `WebContentsView` DOM in the current driver. This test is a smoke test — it verifies the menu action fires without error and the app stays alive. Full pane visibility verification requires opening the terminal view's DevTools, which Playwright doesn't support out-of-the-box.

- [ ] **Step 1: Create `tests/e2e/splits.spec.ts`**

```ts
import { _electron as electron, expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('split menu action does not crash the app', async () => {
  const electronApp = await electron.launch({
    args: [resolve(__dirname, '../../apps/desktop')],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const chrome = await electronApp.firstWindow();
  await expect(chrome.locator('#tab-strip .tab')).toHaveCount(1, { timeout: 8_000 });

  // Trigger the split via the application menu (electronApp.evaluate runs in main).
  await electronApp.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const tabs = menu?.items.find((m) => m.label === 'Tabs');
    const split = tabs?.submenu?.items.find((m) => m.label === 'Split Horizontally');
    split?.click();
  });

  // Wait a moment for the IPC + renderer split to happen.
  await chrome.waitForTimeout(2_000);

  // App is still alive.
  await expect(chrome.locator('#tab-strip .tab')).toHaveCount(1);

  await electronApp.close();
});
```

- [ ] **Step 2: Build and run**

Run: `pnpm --filter @aipad/desktop build && pnpm test:e2e`
Expected: 3 E2E tests passing (smoke + multi-tab + splits).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/splits.spec.ts
git commit -m "test(e2e): split menu action smoke (no crash)"
```

---

## Task 18: GitHub Actions test workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    name: Test on ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r --filter './packages/*' build
      - run: pnpm test
      - name: Install Playwright + Chromium
        run: pnpm --filter @aipad/e2e exec playwright install --with-deps chromium
        if: runner.os == 'Linux'
      - name: Build desktop app
        run: pnpm --filter @aipad/desktop build
        if: runner.os == 'Linux'
      - name: Run E2E on Linux (xvfb-run for headless)
        run: xvfb-run --auto-servernum pnpm test:e2e
        if: runner.os == 'Linux'
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: GitHub Actions test matrix (Windows/macOS/Linux) + E2E on Linux"
```

(No push required — this triggers on next PR/push to main after merge.)

---

## Task 19: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

On tag push (e.g. `v0.1.0`), build installers on all 3 OSes and upload to a GitHub Release.

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    name: Build on ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r --filter './packages/*' build
      - run: pnpm --filter @aipad/desktop build
      - name: Build installer
        run: pnpm --filter @aipad/desktop dist
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: GitHub Actions release workflow (tag-triggered electron-builder dist)"
```

---

## Task 20: README + Plan 3 sign-off + tag

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Status table and add Plan 3 sections**

Change the Status table row for Plan 3 from `not started` to `complete`.

Add an "## Installation" section AFTER "Quick start (development)":

```md
## Installation (pre-built)

Pre-built installers for Windows / macOS / Linux are published as GitHub Releases on every tag push.

- **Windows:** `AI.Pad Setup x.y.z.exe` — NSIS installer.
- **macOS:** `AI.Pad-x.y.z.dmg` — drag to Applications.
- **Linux:** `AI.Pad-x.y.z.AppImage` — `chmod +x` and run.

The app auto-updates from GitHub Releases on next launch.
```

Extend the Keyboard shortcuts section to add the Plan 3 split bindings:

```md
| `Ctrl+\` | Split focused pane horizontally |
| `Ctrl+Shift+\` | Split focused pane vertically |
```

Add a "## Persistence" section AFTER Keyboard shortcuts:

```md
## Persistence

Open tabs persist across restarts. Each tab remembers its shell, cwd, and title; PTYs respawn fresh on relaunch (conversation history inside agents like `claude` is not preserved).

The persisted state lives in your platform's userData directory:

- Windows: `%APPDATA%\AI.Pad\sessions.json`
- macOS: `~/Library/Application Support/AI.Pad/sessions.json`
- Linux: `~/.config/AI.Pad/sessions.json`
```

- [ ] **Step 2: Full pipeline check**

Run: `pnpm install && pnpm -r build && pnpm test && pnpm test:e2e`
Expected: all green.

- [ ] **Step 3: Manual verification (controller)**

SKIP — the controller verifies after commit. Manual checklist:
- Open 2 tabs via `Ctrl+T` (dialog appears for each), close window, re-launch → both tabs restored.
- `Ctrl+\` splits a tab; drag the divider; type in each pane.
- Right-click sidebar row → menu with Close / Rename / Duplicate.
- Drag a tab to reorder.
- `pnpm --filter @aipad/desktop dist` produces an installer.

- [ ] **Step 4: Commit + tag**

```bash
git add README.md
git commit -m "docs: mark Plan 3 — Splits + persistence + packaging complete"
git tag stage1-plan3-splits-persistence-packaging
```

---

## Plan 3 done. Stage 1 complete.

After Plan 3 lands, AI.Pad fully delivers the Stage 1 spec:

- Tabs (Plan 2) ✓
- Splits within tabs (Plan 3) ✓
- Sidebar with status + context menu (Plan 2 + Plan 3) ✓
- Attention detection (BEL + OSC in Plan 2; idle in Plan 3) ✓
- OS notifications (Plan 2) ✓
- Session persistence (Plan 3) ✓
- Cross-platform (Plans 1-3 design; Plan 3 CI matrix) ✓
- Packaging + auto-update (Plan 3) ✓

**Stage 2 begins** with the Overview tab — a special grid view of all sessions. Architecture is already prepared: per-session ring buffers in main make the Overview cheap. Stage 2 plan will be written when the user is ready.
