# AI.Pad — Stage 1, Plan 2: Multi-tab + Attention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-session AI.Pad shell from Plan 1 into a real tabbed terminal: multiple sessions in parallel, an interactive tab strip and collapsible sidebar, attention badges + OS notifications when a background session needs the user, and renderer-crash recovery via ring-buffer replay.

**Architecture:** Each tab gets its own `WebContentsView` managed by a new `ViewManager` in main; all PTY data still passes through `Session` + `RingBuffer` and is now also tee'd through an `AttentionDetector` (BEL + OSC parser) whose signals are broadcast to the chrome renderer. The chrome renderer becomes a real DOM app (vanilla TS, no framework) — `TabStrip`, `Sidebar`, and `LayoutManager` re-render on every state change driven by typed IPC events. Notifications are coalesced and clickable, and a new `core.session.replay` IPC handler lets any newly mounted xterm (fresh tab or post-crash) catch up to the current ring-buffer state.

**Tech Stack:** Continues Plan 1 — Electron 33+, electron-vite 2+, TypeScript 5.5+ (strict), pnpm 9+, node-pty 1.0+, @xterm/xterm 5.5+, zod 3.23+, Vitest 2+, Playwright 1.47+. No new runtime deps in Plan 2.

**Plan 2 scope:**

- `+` / `Ctrl+T` opens a new tab spawning the platform default shell at `$HOME`.
- `X` / `Ctrl+W` closes the focused tab (or kills its shell if still running).
- Click a tab, `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle, `Ctrl+1..9` jump to switch tabs.
- Interactive tab strip shows title + per-tab attention badge.
- Collapsible left **sidebar** lists every session with shell icon, title, status (`running` / `awaiting-input` / `exited`), and time-in-state; `Ctrl+B` toggles it.
- **AttentionDetector** running in main process detects terminal BEL (`\x07`) and OSC escape `\x1b]1337;AIPadAttention=…\x07`; emits structured events.
- Tab badge + sidebar highlight fire on attention. **OS notification** (coalesced ≤1 / 30 s per session) fires when the window is unfocused OR the tab is not currently focused. Clicking the notification focuses the window + activates that tab.
- **Renderer crash recovery:** if a tab's `WebContentsView` renderer crashes, main destroys it, recreates a fresh view, and replays the ring-buffer snapshot into the new xterm. Two crashes in 60 s → fail open ("Tab needs restart" state).
- **`core.session.replay` IPC:** any new xterm calls it at mount to catch up the scrollback (fixes the silent-renderer-startup race we hit in Plan 1).

**Out of scope for Plan 2 (deferred to Plan 3):** NewSessionDialog with shell/cwd picker (Plan 2 always spawns the default shell at `$HOME`); tab drag-to-reorder; sidebar rename/duplicate context menu; splits within a tab; session persistence; cross-platform CI matrix; packaging/auto-update.

**Plan 2 success criteria:**

1. `pnpm dev` opens the app. Initial tab is one PowerShell session as in Plan 1.
2. `Ctrl+T` opens a second tab with its own PowerShell. Each tab is isolated.
3. In the inactive tab, running PowerShell `Write-Host "`a"` (writes a BEL) causes that tab to badge with a yellow attention dot; if the chrome window is unfocused, an OS notification fires.
4. Clicking the notification focuses the window AND switches to that tab.
5. `Ctrl+1` / `Ctrl+2` / `Ctrl+W` / `Ctrl+Tab` all work.
6. `Ctrl+B` toggles the sidebar; sidebar shows all sessions with live status.
7. Killing the renderer for one tab (DevTools → process → terminate) does not crash the app; the tab recovers with scrollback intact.
8. `pnpm test` passes (Plan 1's 10 tests + Plan 2's new unit + integration tests, ~20 total).
9. `pnpm test:e2e` passes (Plan 1's smoke + Plan 2's multi-tab smoke, ~2-3 tests).

---

## File map for this plan

```
packages/contracts/src/
├── session.ts                       [MODIFIED in T1: add AttentionSignal type]
├── ipc.ts                           [MODIFIED in T1: add 5 new channels + schemas]
└── notification.ts                  [NEW in T1: notification payload schema]

packages/core/src/
├── attention-detector.ts            [NEW in T2: state machine + EventEmitter]
├── notification-service.ts          [NEW in T6: Electron Notification wrapper]
├── session.ts                       [MODIFIED in T3: pipe through detector]
├── session-manager.ts               [MODIFIED in T3: forward attention event]
├── ipc-router.ts                    [MODIFIED in T4: new channels + try/catch]
└── index.ts                         [MODIFIED in T2/T6: re-exports]

packages/core/tests/
├── ring-buffer.test.ts              [unchanged]
├── attention-detector.test.ts       [NEW in T2: ~12 unit tests]
└── notification-service.test.ts     [NEW in T6: ~6 unit tests with mocked Electron]

packages/keymap/src/
└── index.ts                         [MODIFIED in T14: add 13 Plan 2 bindings]

packages/terminal-host/src/
└── terminal-host.ts                 [MODIFIED in T5: call session.replay on mount]

apps/desktop/src/main/
├── view-manager.ts                  [NEW in T7: WebContentsView per session]
├── notification-bridge.ts           [NEW in T15: ties NotificationService to main]
└── index.ts                         [REFACTORED in T8/T9/T16: use ViewManager + crash recovery + macOS activate]

apps/desktop/src/renderer/chrome/
├── main.ts                          [REFACTORED in T13: boot LayoutManager]
├── state.ts                         [NEW in T13: ChromeState model]
├── tab-strip.ts                     [NEW in T11: tab bar DOM component]
├── sidebar.ts                       [NEW in T12: left rail DOM component]
├── layout-manager.ts                [NEW in T13: state + IPC orchestration]
└── keyboard.ts                      [NEW in T14: keydown → action wiring]

apps/desktop/index.html              [REPLACED in T10: tab strip + sidebar + view area layout]

tests/integration/
├── session-manager.test.ts          [MODIFIED in T17: replace dead waitFor; add no-op replay test]
└── attention-detector.test.ts       [NEW in T17: real PTY emitting BEL/OSC]

tests/e2e/
├── smoke.spec.ts                    [STRENGTHENED in T16: assert no renderer console errors]
└── multi-tab.spec.ts                [NEW in T18: open 2 tabs, ring bell, observe badge]

README.md                            [MODIFIED in T19: Status table, new shortcuts list]
```

Total: 9 created + 9 modified + 1 replaced. Each new file ≤200 lines.

---

## Task 1: Extend `@aipad/contracts` for Plan 2

**Files:**
- Modify: `packages/contracts/src/session.ts`
- Modify: `packages/contracts/src/ipc.ts`
- Create: `packages/contracts/src/notification.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Add `AttentionSignal` enum to `session.ts`**

Open `packages/contracts/src/session.ts` and append (before the file's end, after `SessionInfoSchema`):

```ts
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
```

- [ ] **Step 2: Replace `packages/contracts/src/ipc.ts`** with the extended version

Full file (paste verbatim, replacing existing contents):

```ts
import { z } from 'zod';
import {
  AttentionEventSchema,
  SessionCreateOptionsSchema,
  SessionIdSchema,
  SessionInfoSchema,
} from './session.js';

/**
 * IPC channel names. Renderer -> Main are "core.*"; Main -> Renderer events are "event.*".
 * Both sides import these strings and the matching schemas — no string literals at call sites.
 */
export const IpcChannel = {
  // Requests (renderer -> main)
  SessionCreate: 'core.session.create',
  SessionCreateDefault: 'core.session.create-default',
  SessionWrite: 'core.session.write',
  SessionResize: 'core.session.resize',
  SessionClose: 'core.session.close',
  SessionList: 'core.session.list',
  SessionReplay: 'core.session.replay',
  LayoutShow: 'core.layout.show',

  // Events (main -> renderer)
  SessionCreated: 'event.session.created',
  SessionData: 'event.session.data',
  SessionExited: 'event.session.exited',
  SessionTitleChanged: 'event.session.title-changed',
  SessionAttention: 'event.session.attention',
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

export const SessionReplayPayloadSchema = z.object({
  sessionId: SessionIdSchema,
});

export const SessionReplayResponseSchema = z.object({
  sessionId: SessionIdSchema,
  data: z.string(), // base64 of RingBuffer.snapshot()
});

export const LayoutShowPayloadSchema = z.object({
  sessionId: SessionIdSchema,
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

// Re-export for caller convenience.
export { SessionCreateOptionsSchema, SessionInfoSchema, SessionIdSchema, AttentionEventSchema };
```

- [ ] **Step 3: Create `packages/contracts/src/notification.ts`**

```ts
import { z } from 'zod';
import { SessionIdSchema } from './session.js';

export const NotificationRequestSchema = z.object({
  sessionId: SessionIdSchema,
  title: z.string().min(1).max(120),
  body: z.string().max(512),
});
export type NotificationRequest = z.infer<typeof NotificationRequestSchema>;
```

- [ ] **Step 4: Update `packages/contracts/src/index.ts`**

Replace its contents with:

```ts
export * from './session.js';
export * from './ipc.js';
export * from './notification.js';
```

- [ ] **Step 5: Typecheck and build**

Run: `pnpm --filter @aipad/contracts typecheck && pnpm --filter @aipad/contracts build`
Expected: no errors. `packages/contracts/dist/notification.js`, `dist/notification.d.ts` exist.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src packages/contracts/dist
git reset packages/contracts/dist
git commit -m "feat(contracts): add Plan 2 IPC channels (attention/replay/layout/notification)"
```

(The `git reset packages/contracts/dist` un-stages dist files — `.gitignore` should exclude them but be defensive.)

---

## Task 2: `AttentionDetector` (TDD)

**Files:**
- Create: `packages/core/tests/attention-detector.test.ts`
- Create: `packages/core/src/attention-detector.ts`
- Modify: `packages/core/src/index.ts`

`AttentionDetector` is a stateful byte-stream scanner. It exposes `process(chunk: Buffer): void` and emits `'attention'` events. Two signals in Plan 2: terminal **BEL** (`\x07`) and **OSC** escape `\x1b]1337;AIPadAttention=<payload>\x07`. Idle-prompt heuristic is **deferred to Plan 3** (it needs a timer + prompt-pattern library; out of scope for the Plan 2 milestone).

The detector tracks whether it's currently inside an OSC sequence so a BEL that terminates an OSC is NOT reported as a plain BEL.

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/attention-detector.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AttentionDetector } from '../src/attention-detector.js';
import type { AttentionEvent } from '@aipad/contracts';

function collect(d: AttentionDetector): AttentionEvent[] {
  const out: AttentionEvent[] = [];
  d.on('attention', (ev) => out.push(ev));
  return out;
}

describe('AttentionDetector', () => {
  it('emits bell for a single BEL byte', () => {
    const d = new AttentionDetector();
    const events = collect(d);
    d.process(Buffer.from([0x07]));
    expect(events).toHaveLength(1);
    expect(events[0]?.signal).toBe('bell');
    expect(events[0]?.confidence).toBe(1);
  });

  it('emits bell for each of multiple BELs in one chunk', () => {
    const d = new AttentionDetector();
    const events = collect(d);
    d.process(Buffer.from([0x07, 0x41, 0x07, 0x42, 0x07]));
    expect(events.filter((e) => e.signal === 'bell')).toHaveLength(3);
  });

  it('does not emit bell on non-BEL bytes', () => {
    const d = new AttentionDetector();
    const events = collect(d);
    d.process(Buffer.from('hello world'));
    expect(events).toHaveLength(0);
  });

  it('emits osc for a complete OSC sequence and not bell for its terminator', () => {
    const d = new AttentionDetector();
    const events = collect(d);
    d.process(Buffer.from('\x1b]1337;AIPadAttention=needs-input\x07'));
    expect(events).toHaveLength(1);
    expect(events[0]?.signal).toBe('osc');
    expect(events[0]?.snippet).toBe('needs-input');
  });

  it('handles OSC split across multiple chunks', () => {
    const d = new AttentionDetector();
    const events = collect(d);
    d.process(Buffer.from('\x1b]1337;AIPad'));
    d.process(Buffer.from('Attention=split-payload'));
    d.process(Buffer.from('\x07'));
    expect(events).toHaveLength(1);
    expect(events[0]?.signal).toBe('osc');
    expect(events[0]?.snippet).toBe('split-payload');
  });

  it('treats BEL outside OSC and BEL inside OSC differently', () => {
    const d = new AttentionDetector();
    const events = collect(d);
    // bell, then OSC (which ends with bell), then bell
    d.process(Buffer.from('\x07\x1b]1337;AIPadAttention=mid\x07\x07'));
    expect(events.map((e) => e.signal)).toEqual(['bell', 'osc', 'bell']);
  });

  it('ignores a malformed OSC-prefix-like sequence that resets', () => {
    const d = new AttentionDetector();
    const events = collect(d);
    // Start of OSC prefix, then a non-matching byte → reset, then plain BEL
    d.process(Buffer.from('\x1b]999;other\x07'));
    expect(events).toHaveLength(1);
    expect(events[0]?.signal).toBe('bell');
  });

  it('cap OSC payload length to prevent runaway buffering', () => {
    const d = new AttentionDetector();
    const events = collect(d);
    const big = 'x'.repeat(2048);
    d.process(Buffer.from(`\x1b]1337;AIPadAttention=${big}\x07`));
    expect(events).toHaveLength(1);
    expect(events[0]?.snippet?.length).toBeLessThanOrEqual(1024);
  });

  it('emits events with a millisecond timestamp', () => {
    const d = new AttentionDetector();
    const events = collect(d);
    const before = Date.now();
    d.process(Buffer.from([0x07]));
    const after = Date.now();
    expect(events[0]?.timestamp).toBeGreaterThanOrEqual(before);
    expect(events[0]?.timestamp).toBeLessThanOrEqual(after);
  });

  it('does not emit any signal for empty input', () => {
    const d = new AttentionDetector();
    const events = collect(d);
    d.process(Buffer.alloc(0));
    expect(events).toHaveLength(0);
  });

  it('processes chunks in order and preserves OSC state across many small writes', () => {
    const d = new AttentionDetector();
    const events = collect(d);
    const seq = '\x1b]1337;AIPadAttention=hello\x07';
    for (const byte of Buffer.from(seq)) {
      d.process(Buffer.from([byte]));
    }
    expect(events).toHaveLength(1);
    expect(events[0]?.signal).toBe('osc');
    expect(events[0]?.snippet).toBe('hello');
  });

  it('does not retain state across detector instances', () => {
    const dA = new AttentionDetector();
    const dB = new AttentionDetector();
    const eA = collect(dA);
    const eB = collect(dB);
    dA.process(Buffer.from('\x1b]1337;AIPadAttention=incomplete'));
    dB.process(Buffer.from([0x07]));
    expect(eA).toHaveLength(0); // OSC not terminated
    expect(eB).toHaveLength(1); // plain BEL on independent detector
    expect(eB[0]?.signal).toBe('bell');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @aipad/core test`
Expected: 12 failing AttentionDetector tests with "Cannot find module './attention-detector.js'" or equivalent.

- [ ] **Step 3: Implement `AttentionDetector`**

Create `packages/core/src/attention-detector.ts`:

```ts
import { EventEmitter } from 'node:events';
import type { AttentionEvent, AttentionSignal } from '@aipad/contracts';

const BEL = 0x07;
const OSC_PREFIX = Buffer.from('\x1b]1337;AIPadAttention=', 'utf8');
const PAYLOAD_MAX = 1024;

export interface AttentionDetectorEvents {
  attention: (ev: AttentionEvent) => void;
}

/**
 * Byte-stream scanner that emits attention events for terminal BEL (\x07) and the AI.Pad
 * OSC escape (\x1b]1337;AIPadAttention=...\x07). Idle-prompt detection is deferred to Plan 3.
 *
 * State machine: outside-OSC vs. inside-OSC. BEL inside OSC is the terminator, NOT a bell event.
 * Prefix matching tolerates chunk boundaries (one byte at a time is fine).
 */
export class AttentionDetector extends EventEmitter {
  private inOsc = false;
  private oscPayload = '';
  private prefixMatchPos = 0;

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

      // Outside OSC — try to extend an in-progress prefix match.
      if (byte === OSC_PREFIX[this.prefixMatchPos]) {
        this.prefixMatchPos++;
        if (this.prefixMatchPos === OSC_PREFIX.length) {
          this.inOsc = true;
          this.prefixMatchPos = 0;
        }
        continue;
      }

      // Mismatch: reset prefix progress. The mismatching byte still needs processing
      // (could itself be a plain BEL or the start of a fresh prefix).
      if (this.prefixMatchPos > 0) {
        this.prefixMatchPos = 0;
        // Re-process this byte from scratch.
        i--;
        continue;
      }

      if (byte === BEL) {
        this.emitEvent('bell', 1);
      }
    }
  }

  private emitEvent(signal: AttentionSignal, confidence: number, snippet?: string): void {
    const ev: AttentionEvent = {
      sessionId: '__pending__', // Caller (Session) rewrites this with the actual id.
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

- [ ] **Step 4: Update `packages/core/src/index.ts`**

Append two new exports:

```ts
export { RingBuffer } from './ring-buffer.js';
export { Session } from './session.js';
export type { SessionEvents } from './session.js';
export { SessionManager } from './session-manager.js';
export type { SessionManagerEvents } from './session-manager.js';
export { IpcRouter } from './ipc-router.js';
export { AttentionDetector } from './attention-detector.js';
export type { AttentionDetectorEvents } from './attention-detector.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @aipad/core test`
Expected: 7 RingBuffer + 12 AttentionDetector = 19 tests, all passing.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/attention-detector.ts packages/core/src/index.ts packages/core/tests/attention-detector.test.ts
git commit -m "feat(core): add AttentionDetector with BEL + OSC parsing (TDD)"
```

---

## Task 3: Wire `AttentionDetector` into `Session` + `SessionManager`

**Files:**
- Modify: `packages/core/src/session.ts`
- Modify: `packages/core/src/session-manager.ts`

- [ ] **Step 1: Modify `packages/core/src/session.ts`** — add detector + new event type

Open the file. Add `attention` to `SessionEvents`:

```ts
import type {
  AttentionEvent,
  SessionCreateOptions,
  SessionId,
  SessionInfo,
  SessionStatus,
} from '@aipad/contracts';
import { AttentionDetector } from './attention-detector.js';
import { RingBuffer } from './ring-buffer.js';
import { EventEmitter } from 'node:events';
import * as pty from 'node-pty';

export interface SessionEvents {
  data: (chunk: Buffer) => void;
  exit: (info: { exitCode: number | null; signal: string | null }) => void;
  titleChanged: (title: string) => void;
  attention: (ev: AttentionEvent) => void;
}
```

Then in the `Session` class, add `private readonly detector = new AttentionDetector();` near the other private fields, and modify the `onData` callback to also process via the detector and to forward attention events with the correct sessionId. The complete revised class:

```ts
export class Session extends EventEmitter {
  readonly id: SessionId;
  readonly opts: SessionCreateOptions;
  readonly ringBuffer: RingBuffer;
  private readonly pty: pty.IPty;
  private readonly detector = new AttentionDetector();
  private _title: string;
  private _status: SessionStatus = 'starting';
  private _exitCode: number | null = null;

  constructor(id: SessionId, opts: SessionCreateOptions) {
    super();
    this.id = id;
    this.opts = opts;
    this.ringBuffer = new RingBuffer(DEFAULT_RING_CAPACITY);
    this._title = opts.title ?? shellCommand(opts.shell);

    this.pty = pty.spawn(shellCommand(opts.shell), [], {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
    });
    this._status = 'running';

    this.detector.on('attention', (ev) => {
      // Detector emits with sessionId='__pending__'; rewrite with our real id.
      this._status = 'awaiting-input';
      this.emit('attention', { ...ev, sessionId: this.id });
    });

    this.pty.onData((data: string) => {
      // node-pty delivers a decoded string; re-encode to Buffer for the ring buffer + downstream consumers.
      const buf = Buffer.from(data, 'utf8');
      this.ringBuffer.write(buf);
      this.detector.process(buf);
      this.emit('data', buf);
    });

    this.pty.onExit(({ exitCode, signal }) => {
      this._status = 'exited';
      this._exitCode = exitCode;
      this.emit('exit', { exitCode, signal: signal != null ? String(signal) : null });
    });
  }

  write(data: Buffer | string): void {
    if (this._status === 'exited') return;
    // Any user input clears the awaiting-input state.
    if (this._status === 'awaiting-input') this._status = 'running';
    this.pty.write(typeof data === 'string' ? data : data.toString('utf8'));
  }

  resize(cols: number, rows: number): void {
    if (this._status === 'exited') return;
    this.pty.resize(cols, rows);
  }

  kill(signal: 'SIGHUP' | 'SIGTERM' | 'SIGKILL' = 'SIGHUP'): void {
    if (this._status === 'exited') return;
    if (process.platform === 'win32') {
      this.pty.kill();
    } else {
      this.pty.kill(signal);
    }
  }

  setTitle(title: string): void {
    if (this._title === title) return;
    this._title = title;
    this.emit('titleChanged', title);
  }

  info(): SessionInfo {
    return {
      id: this.id,
      title: this._title,
      shell: this.opts.shell,
      cwd: this.opts.cwd,
      status: this._status,
      pid: this.pty.pid,
      exitCode: this._exitCode,
    };
  }
}

export interface Session {
  on<K extends keyof SessionEvents>(event: K, listener: SessionEvents[K]): this;
  emit<K extends keyof SessionEvents>(event: K, ...args: Parameters<SessionEvents[K]>): boolean;
}
```

Note: `Session.write()` now clears `awaiting-input` status when the user types. This is the spec's "attention auto-clears on next user keystroke" rule.

- [ ] **Step 2: Modify `packages/core/src/session-manager.ts`** — forward attention

In `SessionManagerEvents` add `sessionAttention`:

```ts
import type { AttentionEvent, SessionCreateOptions, SessionId, SessionInfo } from '@aipad/contracts';

export interface SessionManagerEvents {
  sessionCreated: (info: SessionInfo) => void;
  sessionData: (sessionId: SessionId, chunk: Buffer) => void;
  sessionExited: (sessionId: SessionId, exitCode: number | null, signal: string | null) => void;
  sessionTitleChanged: (sessionId: SessionId, title: string) => void;
  sessionAttention: (ev: AttentionEvent) => void;
}
```

In `create()`, after the other `session.on(...)` registrations, add:

```ts
session.on('attention', (ev) => this.emit('sessionAttention', ev));
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aipad/core typecheck`
Expected: no errors.

- [ ] **Step 4: Run tests to confirm no regression**

Run: `pnpm --filter @aipad/core test`
Expected: 19 tests still passing (7 RingBuffer + 12 AttentionDetector).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session.ts packages/core/src/session-manager.ts
git commit -m "feat(core): pipe Session output through AttentionDetector; emit sessionAttention"
```

---

## Task 4: `IpcRouter` extensions — broadcast events, replay handler, try/catch

**Files:**
- Modify: `packages/core/src/ipc-router.ts`

- [ ] **Step 1: Replace `packages/core/src/ipc-router.ts`** with the extended version

Full file (paste verbatim, replacing existing contents):

```ts
import type { IpcMain, WebContents } from 'electron';
import {
  IpcChannel,
  SessionCreateOptionsSchema,
  SessionWritePayloadSchema,
  SessionResizePayloadSchema,
  SessionClosePayloadSchema,
  SessionReplayPayloadSchema,
  LayoutShowPayloadSchema,
} from '@aipad/contracts';
import type {
  AttentionEvent,
  SessionId,
  SessionInfo,
  SessionReplayResponseSchema,
} from '@aipad/contracts';
import type { z } from 'zod';
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

export class IpcRouter {
  private readonly subscribers = new Set<WebContents>();
  private layoutShowCallback: LayoutShowCallback | null = null;

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

  subscribe(wc: WebContents): void {
    this.subscribers.add(wc);
    wc.once('destroyed', () => this.subscribers.delete(wc));
  }

  private bindRequests(): void {
    this.ipcMain.handle(IpcChannel.SessionCreate, (_e, raw): SessionInfo | { error: string } => {
      const parsed = SessionCreateOptionsSchema.safeParse(raw);
      if (!parsed.success) return { error: parsed.error.message };
      try {
        return this.manager.create(parsed.data).info();
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

    this.ipcMain.handle(IpcChannel.SessionList, () => this.manager.list());

    this.ipcMain.handle(
      IpcChannel.SessionReplay,
      (_e, raw): z.infer<typeof SessionReplayResponseSchema> | { error: string } => {
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
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @aipad/core typecheck`
Expected: no errors.

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @aipad/core test`
Expected: 19 still passing.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/ipc-router.ts
git commit -m "feat(core): IpcRouter handles replay+layout, broadcasts created+attention, try/catches create"
```

---

## Task 5: `TerminalHost` — call `session.replay` on mount

**Files:**
- Modify: `packages/terminal-host/src/terminal-host.ts`

- [ ] **Step 1: Modify `wireOutput` to do an upfront replay**

In `packages/terminal-host/src/terminal-host.ts`, find the constructor body. After `this.wireResize(opts.container);`, add an inline call to a new private method `void this.replay();`.

Then add the `replay()` method to the class (place near `wireOutput`):

```ts
private async replay(): Promise<void> {
  try {
    const response = await this.bridge.send(IpcChannel.SessionReplay, { sessionId: this.sessionId });
    const r = response as { sessionId: string; data: string } | { error: string };
    if ('error' in r) {
      console.warn('[terminal] replay failed:', r.error);
      return;
    }
    if (!r.data) return;
    this.term.write(decodeUtf8Base64(r.data));
  } catch (err) {
    console.warn('[terminal] replay threw:', err);
  }
}
```

The full file should now read (replace whole file to keep it clean):

```ts
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import type { SessionId } from '@aipad/contracts';
import { IpcChannel } from '@aipad/contracts';

/**
 * Bridge between an xterm.js Terminal instance and one Session in the main process.
 *
 * The renderer's preload exposes:
 *   window.aipad.send(channel, payload)          -> Promise<unknown>
 *   window.aipad.on(channel, handler)           -> unsubscribe
 *
 * (Defined in apps/desktop/src/preload/index.ts.)
 */
export interface PreloadBridge {
  send: (channel: string, payload?: unknown) => Promise<unknown>;
  on: (channel: string, handler: (payload: unknown) => void) => () => void;
}

export interface TerminalHostOptions {
  container: HTMLElement;
  sessionId: SessionId;
  bridge: PreloadBridge;
}

function encodeUtf8Base64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeUtf8Base64(input: string): string {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export class TerminalHost {
  private readonly term: Terminal;
  private readonly fit: FitAddon;
  private readonly bridge: PreloadBridge;
  private readonly sessionId: SessionId;
  private unsubscribers: Array<() => void> = [];
  private resizeObserver: ResizeObserver | null = null;

  constructor(opts: TerminalHostOptions) {
    this.sessionId = opts.sessionId;
    this.bridge = opts.bridge;

    this.term = new Terminal({
      fontFamily: 'ui-monospace, Menlo, Consolas, "Courier New", monospace',
      fontSize: 14,
      cursorBlink: true,
      convertEol: false,
      scrollback: 5000,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
      },
    });
    this.fit = new FitAddon();
    this.term.loadAddon(this.fit);
    this.term.loadAddon(new WebLinksAddon());

    this.term.open(opts.container);
    this.fit.fit();

    this.wireInput();
    this.wireOutput();
    this.wireResize(opts.container);
    void this.replay();
  }

  dispose(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this.resizeObserver?.disconnect();
    this.term.dispose();
  }

  private async replay(): Promise<void> {
    try {
      const response = await this.bridge.send(IpcChannel.SessionReplay, { sessionId: this.sessionId });
      const r = response as { sessionId: string; data: string } | { error: string };
      if ('error' in r) {
        console.warn('[terminal] replay failed:', r.error);
        return;
      }
      if (!r.data) return;
      this.term.write(decodeUtf8Base64(r.data));
    } catch (err) {
      console.warn('[terminal] replay threw:', err);
    }
  }

  private wireInput(): void {
    const sub = this.term.onData((data) => {
      void this.bridge.send(IpcChannel.SessionWrite, {
        sessionId: this.sessionId,
        data: encodeUtf8Base64(data),
      });
    });
    this.unsubscribers.push(() => sub.dispose());
  }

  private wireOutput(): void {
    const onData = this.bridge.on(IpcChannel.SessionData, (raw) => {
      const event = raw as { sessionId: SessionId; data: string };
      if (event.sessionId !== this.sessionId) return;
      this.term.write(decodeUtf8Base64(event.data));
    });

    const onExit = this.bridge.on(IpcChannel.SessionExited, (raw) => {
      const event = raw as { sessionId: SessionId; exitCode: number | null };
      if (event.sessionId !== this.sessionId) return;
      this.term.write(`\r\n\x1b[90m[session exited, code=${event.exitCode}]\x1b[0m\r\n`);
    });

    this.unsubscribers.push(onData, onExit);
  }

  private wireResize(container: HTMLElement): void {
    const dispatchResize = (): void => {
      this.fit.fit();
      const { cols, rows } = this.term;
      void this.bridge.send(IpcChannel.SessionResize, {
        sessionId: this.sessionId,
        cols,
        rows,
      });
    };
    this.resizeObserver = new ResizeObserver(dispatchResize);
    this.resizeObserver.observe(container);
    queueMicrotask(dispatchResize);
  }
}
```

Note the ordering: `wireOutput()` registers the live-data listener BEFORE `replay()` runs. So if new data arrives during the replay, it gets queued behind the snapshot — no race.

- [ ] **Step 2: Build packages and typecheck**

Run: `pnpm --filter @aipad/contracts build && pnpm --filter @aipad/terminal-host typecheck && pnpm --filter @aipad/terminal-host build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/terminal-host/src/terminal-host.ts
git commit -m "feat(terminal-host): replay ring buffer on mount to seed scrollback"
```

---

## Task 6: `NotificationService` (TDD)

**Files:**
- Create: `packages/core/tests/notification-service.test.ts`
- Create: `packages/core/src/notification-service.ts`
- Modify: `packages/core/src/index.ts`

`NotificationService` wraps Electron's `Notification` API with per-session coalescing (max 1 per 30 s per session). Click → callback (used by main to focus the window and switch to the relevant tab).

We test the coalescing + click-callback logic in isolation by injecting a fake `NotificationCtor` (any class with a `show()` method and an `on('click', fn)` listener). In main, the real `Notification` from Electron is injected.

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/notification-service.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationService, type FakeNotification, type FakeNotificationCtor } from '../src/notification-service.js';

/**
 * A fake replacement for Electron's Notification. Each instance records its title/body and
 * exposes a `triggerClick()` helper for tests.
 */
function makeFakeCtor(): { ctor: FakeNotificationCtor; built: FakeNotification[] } {
  const built: FakeNotification[] = [];
  class Fake implements FakeNotification {
    title: string;
    body: string;
    private clickHandlers: Array<() => void> = [];

    constructor(opts: { title: string; body: string }) {
      this.title = opts.title;
      this.body = opts.body;
      built.push(this);
    }

    show(): void { /* no-op */ }

    on(event: string, handler: () => void): void {
      if (event === 'click') this.clickHandlers.push(handler);
    }

    triggerClick(): void {
      for (const h of this.clickHandlers) h();
    }
  }
  return { ctor: Fake as unknown as FakeNotificationCtor, built };
}

describe('NotificationService', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows a notification when notify() is called the first time', () => {
    const { ctor, built } = makeFakeCtor();
    const svc = new NotificationService(ctor);
    svc.notify({ sessionId: 'a', title: 'T', body: 'B' });
    expect(built).toHaveLength(1);
    expect(built[0]?.title).toBe('T');
    expect(built[0]?.body).toBe('B');
  });

  it('coalesces a second notify for the same sessionId within 30s', () => {
    const { ctor, built } = makeFakeCtor();
    const svc = new NotificationService(ctor);
    svc.notify({ sessionId: 'a', title: 'First', body: 'b' });
    svc.notify({ sessionId: 'a', title: 'Second', body: 'b' });
    expect(built).toHaveLength(1);
    expect(built[0]?.title).toBe('First');
  });

  it('allows a fresh notify for the same sessionId after 30s', () => {
    const { ctor, built } = makeFakeCtor();
    const svc = new NotificationService(ctor);
    svc.notify({ sessionId: 'a', title: 'First', body: 'b' });
    vi.advanceTimersByTime(31_000);
    svc.notify({ sessionId: 'a', title: 'Second', body: 'b' });
    expect(built).toHaveLength(2);
    expect(built[1]?.title).toBe('Second');
  });

  it('treats different sessionIds independently', () => {
    const { ctor, built } = makeFakeCtor();
    const svc = new NotificationService(ctor);
    svc.notify({ sessionId: 'a', title: 'A', body: 'b' });
    svc.notify({ sessionId: 'b', title: 'B', body: 'b' });
    expect(built).toHaveLength(2);
  });

  it('calls the onClick callback with the sessionId when the notification is clicked', () => {
    const { ctor, built } = makeFakeCtor();
    const clicked: string[] = [];
    const svc = new NotificationService(ctor);
    svc.onClick((sessionId) => clicked.push(sessionId));
    svc.notify({ sessionId: 'xyz', title: 'T', body: 'b' });
    built[0]?.triggerClick();
    expect(clicked).toEqual(['xyz']);
  });

  it('supports a custom coalesce window via constructor option', () => {
    const { ctor, built } = makeFakeCtor();
    const svc = new NotificationService(ctor, { coalesceMs: 5_000 });
    svc.notify({ sessionId: 'a', title: 'First', body: 'b' });
    vi.advanceTimersByTime(6_000);
    svc.notify({ sessionId: 'a', title: 'Second', body: 'b' });
    expect(built).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @aipad/core test`
Expected: 6 NotificationService tests fail with "Cannot find module".

- [ ] **Step 3: Implement `NotificationService`**

Create `packages/core/src/notification-service.ts`:

```ts
import type { SessionId } from '@aipad/contracts';

/**
 * Minimal interface our service consumes from Electron's Notification class. Lets us
 * unit-test with a fake replacement in pure Node.
 */
export interface FakeNotification {
  show(): void;
  on(event: 'click', handler: () => void): void;
}

export type FakeNotificationCtor = new (opts: { title: string; body: string }) => FakeNotification;

export interface NotifyRequest {
  sessionId: SessionId;
  title: string;
  body: string;
}

export interface NotificationServiceOptions {
  /** Minimum milliseconds between notifications for the same session. Default 30_000. */
  coalesceMs?: number;
}

export class NotificationService {
  private readonly Ctor: FakeNotificationCtor;
  private readonly coalesceMs: number;
  private readonly lastShownAt = new Map<SessionId, number>();
  private clickCallback: ((sessionId: SessionId) => void) | null = null;

  constructor(Ctor: FakeNotificationCtor, opts: NotificationServiceOptions = {}) {
    this.Ctor = Ctor;
    this.coalesceMs = opts.coalesceMs ?? 30_000;
  }

  onClick(cb: (sessionId: SessionId) => void): void {
    this.clickCallback = cb;
  }

  notify(req: NotifyRequest): void {
    const now = Date.now();
    const last = this.lastShownAt.get(req.sessionId) ?? -Infinity;
    if (now - last < this.coalesceMs) return;
    this.lastShownAt.set(req.sessionId, now);

    const n = new this.Ctor({ title: req.title, body: req.body });
    n.on('click', () => this.clickCallback?.(req.sessionId));
    n.show();
  }
}
```

- [ ] **Step 4: Update `packages/core/src/index.ts`**

Append:

```ts
export { NotificationService } from './notification-service.js';
export type {
  FakeNotification,
  FakeNotificationCtor,
  NotifyRequest,
  NotificationServiceOptions,
} from './notification-service.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @aipad/core test`
Expected: 7 RingBuffer + 12 AttentionDetector + 6 NotificationService = 25 tests passing.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/notification-service.ts packages/core/src/index.ts packages/core/tests/notification-service.test.ts
git commit -m "feat(core): add NotificationService with coalescing and click callback (TDD)"
```

---

## Task 7: `ViewManager` in main process

**Files:**
- Create: `apps/desktop/src/main/view-manager.ts`

`ViewManager` is the main-process owner of `WebContentsView`s. It maps `SessionId → WebContentsView`, handles show/hide/destroy, layout on parent resize, and a crash callback hook (used in T9).

Show semantics: one tab is visible at a time. Hidden tabs are kept alive (renderer + xterm in memory) but moved offscreen via `setBounds(0, 0, 0, 0)`. This preserves scrollback and IPC subscription state with no Electron-level destroy/recreate cost.

- [ ] **Step 1: Create `apps/desktop/src/main/view-manager.ts`**

```ts
import { BrowserWindow, WebContentsView } from 'electron';
import type { SessionId } from '@aipad/contracts';

const TAB_BAR_PX = 32;       // height of chrome's tab strip
const SIDEBAR_OPEN_PX = 220; // width of chrome's sidebar when expanded
const SIDEBAR_COLLAPSED_PX = 36;

export interface ViewLoadEntry {
  url?: string;
  file?: string;
  query?: Record<string, string>;
}

export interface ViewManagerOptions {
  preloadPath: string;
  onCrash?: (sessionId: SessionId, view: WebContentsView) => void;
}

/**
 * Owns a WebContentsView per session and positions exactly one view at a time inside the
 * chrome window. Sidebar width and tab-strip height are tracked here so we don't have to
 * round-trip layout decisions through the renderer on every resize.
 */
export class ViewManager {
  private readonly views = new Map<SessionId, WebContentsView>();
  private parent: BrowserWindow | null = null;
  private currentSessionId: SessionId | null = null;
  private sidebarPx = SIDEBAR_OPEN_PX;

  constructor(private readonly opts: ViewManagerOptions) {}

  attach(window: BrowserWindow): void {
    this.parent = window;
    window.on('resize', () => this.layout());
  }

  setSidebarWidth(px: number): void {
    this.sidebarPx = Math.max(SIDEBAR_COLLAPSED_PX, px);
    this.layout();
  }

  has(sessionId: SessionId): boolean {
    return this.views.has(sessionId);
  }

  get(sessionId: SessionId): WebContentsView | undefined {
    return this.views.get(sessionId);
  }

  create(sessionId: SessionId): WebContentsView {
    if (!this.parent) throw new Error('ViewManager.create called before attach');
    const view = new WebContentsView({
      webPreferences: {
        preload: this.opts.preloadPath,
        sandbox: false,
        contextIsolation: true,
      },
    });
    this.parent.contentView.addChildView(view);
    this.views.set(sessionId, view);
    this.hideOne(view);

    view.webContents.on('render-process-gone', () => {
      this.opts.onCrash?.(sessionId, view);
    });

    return view;
  }

  async load(sessionId: SessionId, entry: ViewLoadEntry): Promise<void> {
    const view = this.views.get(sessionId);
    if (!view) throw new Error(`ViewManager.load: unknown sessionId ${sessionId}`);
    if (entry.url) {
      const url = entry.query
        ? `${entry.url}?${new URLSearchParams(entry.query).toString()}`
        : entry.url;
      await view.webContents.loadURL(url);
    } else if (entry.file) {
      const options = entry.query ? { query: entry.query } : undefined;
      await view.webContents.loadFile(entry.file, options);
    }
  }

  show(sessionId: SessionId): void {
    if (!this.parent) return;
    const view = this.views.get(sessionId);
    if (!view) return;
    for (const [otherId, otherView] of this.views) {
      if (otherId !== sessionId) this.hideOne(otherView);
    }
    this.currentSessionId = sessionId;
    this.applyVisibleBounds(view);
    view.webContents.focus();
  }

  destroy(sessionId: SessionId): void {
    const view = this.views.get(sessionId);
    if (!view) return;
    if (this.parent) this.parent.contentView.removeChildView(view);
    // WebContentsView has no destroy(); closing the webContents detaches and frees it.
    view.webContents.close();
    this.views.delete(sessionId);
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
  }

  /** Re-position whichever view is currently visible. Called on parent resize. */
  layout(): void {
    if (!this.parent || !this.currentSessionId) return;
    const view = this.views.get(this.currentSessionId);
    if (view) this.applyVisibleBounds(view);
  }

  /** Replace the underlying WebContentsView for a session (used during crash recovery). */
  replaceView(sessionId: SessionId): WebContentsView | null {
    const old = this.views.get(sessionId);
    if (!old || !this.parent) return null;
    this.parent.contentView.removeChildView(old);
    try {
      old.webContents.close();
    } catch {
      /* ignore */
    }
    this.views.delete(sessionId);
    const fresh = this.create(sessionId);
    return fresh;
  }

  private applyVisibleBounds(view: WebContentsView): void {
    if (!this.parent) return;
    const { width, height } = this.parent.getContentBounds();
    view.setBounds({
      x: this.sidebarPx,
      y: TAB_BAR_PX,
      width: Math.max(0, width - this.sidebarPx),
      height: Math.max(0, height - TAB_BAR_PX),
    });
  }

  private hideOne(view: WebContentsView): void {
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @aipad/desktop typecheck`
Expected: no errors. (T8 will actually wire this into main; here we're just confirming the file compiles.)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/view-manager.ts
git commit -m "feat(desktop): add ViewManager for per-session WebContentsView lifecycle"
```

---

## Task 8: Refactor `apps/desktop/src/main/index.ts` to use `ViewManager`

**Files:**
- Modify: `apps/desktop/src/main/index.ts`

The Plan 1 main creates exactly one session at startup. In Plan 2 main:
- Creates ONE initial session at startup (so the app boots with something visible).
- Handles `IpcChannel.SessionCreate` via the IpcRouter (the renderer drives new tab creation).
- Handles `IpcChannel.SessionCreateDefault` directly in main so the renderer can ask for "just spawn the default" without needing to know the host's default shell or `homedir()`.
- Wires `IpcRouter.onLayoutShow` to `ViewManager.show()`.
- Listens to `sessionManager.on('sessionCreated', ...)` to spawn a fresh `WebContentsView` for every new session (whether the create came from main's initial spawn or from a renderer request).

- [ ] **Step 1: Replace `apps/desktop/src/main/index.ts`** with the Plan 2 version

```ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { IpcChannel, IpcRouter, SessionManager } from '@aipad/core';
import type { Shell, SessionInfo } from '@aipad/contracts';
import { ViewManager } from './view-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged && process.env['NODE_ENV'] !== 'production';

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const sessionManager = new SessionManager();
const ipcRouter = new IpcRouter(ipcMain, sessionManager);

let chromeWindow: BrowserWindow | null = null;
let viewManager: ViewManager | null = null;

function defaultShell(): Shell {
  if (process.platform === 'win32') return 'pwsh';
  if (process.platform === 'darwin') return 'zsh';
  return 'bash';
}

function preloadPath(): string {
  return join(__dirname, '../preload/index.mjs');
}

function rendererEntry(name: 'chrome' | 'terminal'): { url?: string; file?: string } {
  if (isDev) {
    const port = process.env['ELECTRON_RENDERER_URL'];
    if (!port) throw new Error('ELECTRON_RENDERER_URL is required in dev (set by electron-vite)');
    return { url: name === 'chrome' ? `${port}/index.html` : `${port}/terminal-host.html` };
  }
  return { file: join(__dirname, `../renderer/${name === 'chrome' ? 'index' : 'terminal-host'}.html`) };
}

// IPC: renderer asks main to spawn the platform default shell at $HOME.
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

// Every newly created session (from any path — initial spawn, renderer request, etc.) gets
// a fresh WebContentsView + replay-aware terminal page.
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
  // Make the newly created session the visible one. The renderer's LayoutManager will
  // confirm by sending its own LayoutShow message, but we show here so there's never a
  // moment where no view is visible.
  viewManager.show(info.id);
});

sessionManager.on('sessionExited', (sessionId) => {
  // Don't destroy the view on exit — the user may want to read the scrollback. The view
  // is destroyed only when the user explicitly closes the tab (LayoutManager calls
  // core.session.close → SessionManager.close → we destroy here via the close handler).
  void sessionId;
});

ipcRouter.onLayoutShow((sessionId) => {
  viewManager?.show(sessionId);
});

async function createChromeWindow(): Promise<void> {
  chromeWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
    },
  });

  viewManager = new ViewManager({
    preloadPath: preloadPath(),
    onCrash: (sessionId) => handleRendererCrash(sessionId),
  });
  viewManager.attach(chromeWindow);

  await (() => {
    const entry = rendererEntry('chrome');
    if (entry.url) return chromeWindow!.webContents.loadURL(entry.url);
    return chromeWindow!.webContents.loadFile(entry.file!);
  })();
  ipcRouter.subscribe(chromeWindow.webContents);

  // Create the initial session so the app boots with something visible. The sessionCreated
  // listener above takes care of the matching view.
  sessionManager.create({
    shell: defaultShell(),
    cwd: homedir(),
    cols: 80,
    rows: 24,
  });

  chromeWindow.on('closed', () => {
    chromeWindow = null;
    viewManager = null;
  });
}

const crashCounters = new Map<string, number[]>(); // sessionId → recent crash timestamps
function handleRendererCrash(sessionId: string): void {
  if (!viewManager) return;
  const now = Date.now();
  const recent = (crashCounters.get(sessionId) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  crashCounters.set(sessionId, recent);
  if (recent.length >= 2) {
    console.warn(`[main] tab ${sessionId} crashed twice in 60s; not auto-recovering.`);
    return;
  }
  console.warn(`[main] tab ${sessionId} crashed; recreating view + replaying scrollback.`);
  // Replacing the view re-loads the terminal page; replay() inside the new TerminalHost
  // pulls the ring buffer snapshot via core.session.replay automatically.
  void (async () => {
    const fresh = viewManager!.replaceView(sessionId);
    if (!fresh) return;
    ipcRouter.subscribe(fresh.webContents);
    const entry = rendererEntry('terminal');
    await viewManager!.load(sessionId, {
      ...(entry.url ? { url: entry.url } : {}),
      ...(entry.file ? { file: entry.file } : {}),
      query: { sessionId },
    });
    viewManager!.show(sessionId);
  })();
}

app.whenReady().then(async () => {
  await createChromeWindow();
});

app.on('second-instance', () => {
  if (chromeWindow) {
    if (chromeWindow.isMinimized()) chromeWindow.restore();
    chromeWindow.focus();
  }
});

app.on('activate', () => {
  // macOS: re-create the window when the dock icon is clicked and no windows are open.
  if (BrowserWindow.getAllWindows().length === 0) void createChromeWindow();
});

app.on('before-quit', async (event) => {
  if (sessionManager.list().length === 0) return;
  event.preventDefault();
  await sessionManager.closeAll();
  app.exit(0);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 2: Re-export `IpcChannel` from `@aipad/core` so main can import it**

Open `packages/core/src/index.ts`. Add at the bottom:

```ts
export { IpcChannel } from '@aipad/contracts';
```

(Then rebuild the core package: `pnpm --filter @aipad/core build`.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aipad/core build && pnpm --filter @aipad/desktop typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts apps/desktop/src/main/index.ts
git commit -m "feat(desktop): main uses ViewManager; supports multi-session lifecycle + macOS activate"
```

---

## Task 9: Renderer crash recovery — exercise

Step 8 already implemented `handleRendererCrash` and wired it. Task 9 verifies it works by adding a quick integration of the existing crash path — no new code. This task is a verification + commit-message-fix-up step.

**Files:**
- (no file changes; verification only)

- [ ] **Step 1: Manually verify crash recovery (optional — engineer choice)**

Run `pnpm --filter @aipad/desktop build && pnpm --filter @aipad/desktop dev` (or `pnpm dev`). Open the app. Open chrome DevTools (`Ctrl+Shift+I`). In the chrome console:

```js
// Find the active terminal webContents by walking the parent chrome's child views.
// (No direct DOM access; we can simulate a crash by closing the app's terminal renderer
// from the terminal renderer's own DevTools via the chrome's Window menu → Toggle
// Developer Tools for the second view.) Easiest reproducer:
//   - In the terminal view's DevTools console, run: process.crash()
// Expected: the window briefly blanks; main prints "tab <id> crashed; recreating view";
// the terminal reappears with the previous prompt intact (replayed from the ring buffer).
```

This is a manual verification — no automated test for renderer crash in Plan 2 (Playwright's Electron driver doesn't expose individual `WebContentsView`s as Pages yet). T18 will add a coarser multi-tab Playwright test.

- [ ] **Step 2: Sanity-check the codepaths exist**

Run: `pnpm --filter @aipad/desktop typecheck`
Expected: no errors.

Run: `grep -n "handleRendererCrash\|render-process-gone\|replaceView" apps/desktop/src/main/index.ts apps/desktop/src/main/view-manager.ts`
Expected output should include matches in both files showing the crash flow is wired.

- [ ] **Step 3: No commit needed (T9 added no code)**

Skip the commit. Continue to T10.

---

## Task 10: Chrome HTML layout for tab strip + sidebar + view area

**Files:**
- Replace: `apps/desktop/index.html`

Plan 2 reuses the chrome HTML page but restructures the layout into three regions: top tab strip (32 px), left sidebar (toggleable: 220 px open, 36 px collapsed), main view area (filled by `WebContentsView` overlay). The `WebContentsView` actually overlays this DOM, so the DOM regions are mostly placeholders for layout reference + interactive controls.

- [ ] **Step 1: Replace `apps/desktop/index.html`** with the Plan 2 layout

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>AI.Pad</title>
    <style>
      :root {
        --bg: #1e1e1e;
        --bg-elev: #252526;
        --fg: #d4d4d4;
        --fg-dim: #8b8b8b;
        --accent: #4ade80;
        --warn: #f9c74f;
        --tab-h: 32px;
        --sidebar-open: 220px;
        --sidebar-collapsed: 36px;
      }
      html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        background: var(--bg);
        color: var(--fg);
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size: 12px;
        overflow: hidden;
        user-select: none;
      }
      #chrome-root { display: grid; grid-template-rows: var(--tab-h) 1fr; height: 100%; }
      #tab-strip { display: flex; align-items: stretch; background: var(--bg-elev); border-bottom: 1px solid #333; padding: 0 4px; gap: 2px; overflow: hidden; }
      .tab { display: flex; align-items: center; gap: 6px; padding: 0 12px; background: #2d2d2d; color: var(--fg-dim); border-top-left-radius: 4px; border-top-right-radius: 4px; cursor: pointer; max-width: 240px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .tab.active { background: var(--bg); color: var(--fg); }
      .tab .dot { width: 7px; height: 7px; border-radius: 50%; background: transparent; flex-shrink: 0; }
      .tab .dot.running { background: var(--accent); }
      .tab .dot.attention { background: var(--warn); box-shadow: 0 0 6px var(--warn); }
      .tab .dot.exited { background: var(--fg-dim); }
      .tab .close { color: var(--fg-dim); margin-left: auto; padding: 0 4px; }
      .tab .close:hover { color: var(--fg); }
      .tab .title { overflow: hidden; text-overflow: ellipsis; }
      #new-tab { padding: 0 12px; background: transparent; color: var(--fg-dim); cursor: pointer; border: none; font-size: 16px; }
      #new-tab:hover { color: var(--fg); }
      #body { display: grid; grid-template-columns: var(--sidebar-open) 1fr; height: 100%; min-height: 0; }
      #body.sidebar-collapsed { grid-template-columns: var(--sidebar-collapsed) 1fr; }
      #sidebar { background: var(--bg-elev); border-right: 1px solid #333; overflow: hidden; display: flex; flex-direction: column; }
      #sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; color: var(--fg-dim); font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; }
      #sidebar-toggle { background: transparent; border: none; color: var(--fg-dim); cursor: pointer; padding: 2px 6px; }
      #sidebar-toggle:hover { color: var(--fg); }
      #sidebar-list { flex: 1; overflow-y: auto; padding: 4px; }
      .sidebar-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px; cursor: pointer; color: var(--fg-dim); }
      .sidebar-row:hover { background: #2d2d2d; }
      .sidebar-row.active { background: #094771; color: var(--fg); }
      .sidebar-row.attention { background: #5a4a1a; color: var(--fg); }
      .sidebar-row .meta { display: block; font-size: 10px; color: var(--fg-dim); margin-top: 2px; }
      #view-host { position: relative; min-width: 0; min-height: 0; }
      #view-anchor { position: absolute; inset: 0; }
      body.sidebar-collapsed .sidebar-row .title-text,
      body.sidebar-collapsed .sidebar-row .meta,
      body.sidebar-collapsed #sidebar-label { display: none; }
    </style>
  </head>
  <body>
    <div id="chrome-root">
      <div id="tab-strip"></div>
      <div id="body">
        <aside id="sidebar">
          <div id="sidebar-header">
            <span id="sidebar-label">Sessions</span>
            <button id="sidebar-toggle" title="Toggle sidebar (Ctrl+B)">⇔</button>
          </div>
          <div id="sidebar-list"></div>
        </aside>
        <div id="view-host"><div id="view-anchor"></div></div>
      </div>
    </div>
    <script type="module" src="/src/renderer/chrome/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Build to make sure Vite likes the new HTML**

Run: `pnpm --filter @aipad/desktop build`
Expected: clean build; `out/renderer/index.html` exists.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/index.html
git commit -m "feat(desktop): chrome HTML — tab strip + sidebar + view-host layout"
```

---

## Task 11: `TabStrip` component

**Files:**
- Create: `apps/desktop/src/renderer/chrome/tab-strip.ts`

A pure-DOM component that renders the tab strip from a state object. No frameworks. Listens for clicks and dispatches via callbacks.

- [ ] **Step 1: Create `apps/desktop/src/renderer/chrome/tab-strip.ts`**

```ts
import type { SessionId, SessionInfo } from '@aipad/contracts';

export interface TabViewModel {
  info: SessionInfo;
  attention: boolean;
}

export interface TabStripCallbacks {
  onTabClick: (sessionId: SessionId) => void;
  onTabClose: (sessionId: SessionId) => void;
  onNewTab: () => void;
}

export class TabStrip {
  private readonly root: HTMLElement;
  private readonly callbacks: TabStripCallbacks;

  constructor(root: HTMLElement, callbacks: TabStripCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
  }

  render(tabs: TabViewModel[], focusedId: SessionId | null): void {
    this.root.innerHTML = '';
    for (const tab of tabs) {
      const el = document.createElement('div');
      el.className = 'tab' + (tab.info.id === focusedId ? ' active' : '');
      el.dataset['sessionId'] = tab.info.id;

      const dot = document.createElement('span');
      dot.className = 'dot ' + (tab.attention
        ? 'attention'
        : tab.info.status === 'running'
          ? 'running'
          : tab.info.status === 'exited'
            ? 'exited'
            : '');
      el.appendChild(dot);

      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = tab.info.title || tab.info.shell;
      el.appendChild(title);

      const close = document.createElement('span');
      close.className = 'close';
      close.textContent = '×';
      close.title = 'Close tab (Ctrl+W)';
      close.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.callbacks.onTabClose(tab.info.id);
      });
      el.appendChild(close);

      el.addEventListener('click', () => this.callbacks.onTabClick(tab.info.id));
      this.root.appendChild(el);
    }

    const plus = document.createElement('button');
    plus.id = 'new-tab';
    plus.textContent = '+';
    plus.title = 'New tab (Ctrl+T)';
    plus.addEventListener('click', () => this.callbacks.onNewTab());
    this.root.appendChild(plus);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @aipad/desktop typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/chrome/tab-strip.ts
git commit -m "feat(chrome): TabStrip DOM component (tabs + close + new-tab)"
```

---

## Task 12: `Sidebar` component

**Files:**
- Create: `apps/desktop/src/renderer/chrome/sidebar.ts`

Sidebar lists every session with status + time-in-state. Clicking a row switches to that tab. The "time-in-state" updates as the LayoutManager triggers re-renders on a tick.

- [ ] **Step 1: Create `apps/desktop/src/renderer/chrome/sidebar.ts`**

```ts
import type { SessionId, SessionInfo } from '@aipad/contracts';

export interface SidebarRowVm {
  info: SessionInfo;
  attention: boolean;
  /** Time the session entered its current status, in epoch ms. */
  statusSinceMs: number;
}

export interface SidebarCallbacks {
  onRowClick: (sessionId: SessionId) => void;
  onToggle: () => void;
}

const SHELL_ICONS: Record<string, string> = {
  pwsh: 'PS',
  powershell: 'PS',
  cmd: 'CM',
  bash: 'BA',
  zsh: 'ZS',
  wsl: 'WSL',
};

export class Sidebar {
  private readonly listEl: HTMLElement;
  private readonly toggleEl: HTMLElement;
  private readonly callbacks: SidebarCallbacks;

  constructor(opts: {
    listEl: HTMLElement;
    toggleEl: HTMLElement;
    callbacks: SidebarCallbacks;
  }) {
    this.listEl = opts.listEl;
    this.toggleEl = opts.toggleEl;
    this.callbacks = opts.callbacks;
    this.toggleEl.addEventListener('click', () => this.callbacks.onToggle());
  }

  render(rows: SidebarRowVm[], focusedId: SessionId | null): void {
    this.listEl.innerHTML = '';
    const now = Date.now();
    for (const row of rows) {
      const el = document.createElement('div');
      el.className =
        'sidebar-row' +
        (row.info.id === focusedId ? ' active' : '') +
        (row.attention ? ' attention' : '');
      el.dataset['sessionId'] = row.info.id;

      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = SHELL_ICONS[row.info.shell] ?? '??';
      el.appendChild(icon);

      const content = document.createElement('div');
      content.style.flex = '1';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'title-text';
      titleSpan.textContent = row.info.title || row.info.shell;
      content.appendChild(titleSpan);

      const meta = document.createElement('span');
      meta.className = 'meta';
      const ageSec = Math.max(0, Math.floor((now - row.statusSinceMs) / 1000));
      meta.textContent = `${row.info.status} · ${formatAge(ageSec)}`;
      content.appendChild(meta);

      el.appendChild(content);
      el.addEventListener('click', () => this.callbacks.onRowClick(row.info.id));
      this.listEl.appendChild(el);
    }
  }
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @aipad/desktop typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/chrome/sidebar.ts
git commit -m "feat(chrome): Sidebar DOM component (per-session status + time-in-state)"
```

---

## Task 13: `LayoutManager` + `state.ts` + chrome entry

**Files:**
- Create: `apps/desktop/src/renderer/chrome/state.ts`
- Create: `apps/desktop/src/renderer/chrome/layout-manager.ts`
- Replace: `apps/desktop/src/renderer/chrome/main.ts`

`LayoutManager` is the chrome renderer's state-and-orchestration brain. It:
- Maintains the canonical `ChromeState` (sessions, focused id, tab order, sidebar state, attention bits).
- Subscribes to IPC events (`sessionCreated`, `sessionExited`, `sessionAttention`).
- Drives TabStrip and Sidebar re-renders on every state change.
- Issues IPC requests (`session.create-default`, `session.close`, `layout.show`).
- Ticks every 1 s to refresh sidebar time-in-state.

- [ ] **Step 1: Create `apps/desktop/src/renderer/chrome/state.ts`**

```ts
import type { SessionId, SessionInfo } from '@aipad/contracts';

export interface SessionState {
  info: SessionInfo;
  attention: boolean;
  /** Epoch ms when this session entered its current status. */
  statusSinceMs: number;
}

export interface ChromeState {
  sessions: Map<SessionId, SessionState>;
  tabOrder: SessionId[];
  focusedId: SessionId | null;
  sidebarOpen: boolean;
}

export function emptyState(): ChromeState {
  return {
    sessions: new Map(),
    tabOrder: [],
    focusedId: null,
    sidebarOpen: true,
  };
}
```

- [ ] **Step 2: Create `apps/desktop/src/renderer/chrome/layout-manager.ts`**

```ts
import type { SessionId, SessionInfo, AttentionEvent } from '@aipad/contracts';
import { IpcChannel } from '@aipad/contracts';
import type { PreloadBridge } from '@aipad/terminal-host';
import { TabStrip, type TabViewModel } from './tab-strip.js';
import { Sidebar, type SidebarRowVm } from './sidebar.js';
import { emptyState, type ChromeState, type SessionState } from './state.js';

export interface LayoutDeps {
  bridge: PreloadBridge;
  tabStrip: TabStrip;
  sidebar: Sidebar;
  bodyEl: HTMLElement;
}

export class LayoutManager {
  private readonly bridge: PreloadBridge;
  private readonly tabStrip: TabStrip;
  private readonly sidebar: Sidebar;
  private readonly bodyEl: HTMLElement;
  private readonly state: ChromeState = emptyState();
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  constructor(deps: LayoutDeps) {
    this.bridge = deps.bridge;
    this.tabStrip = deps.tabStrip;
    this.sidebar = deps.sidebar;
    this.bodyEl = deps.bodyEl;
  }

  async start(): Promise<void> {
    // Subscribe to events FIRST (before any await), then query the list. This order
    // closes the race where main may create the boot session between the list query
    // and the listener registration. `upsertSession` is idempotent so double-counting
    // is safe.
    this.bridge.on(IpcChannel.SessionCreated, (raw) => {
      const e = raw as { info: SessionInfo };
      this.upsertSession(e.info);
      this.focus(e.info.id);
    });
    this.bridge.on(IpcChannel.SessionExited, (raw) => {
      const e = raw as { sessionId: SessionId; exitCode: number | null };
      const session = this.state.sessions.get(e.sessionId);
      if (session) {
        session.info = { ...session.info, status: 'exited', exitCode: e.exitCode };
        session.statusSinceMs = Date.now();
        this.render();
      }
    });
    this.bridge.on(IpcChannel.SessionAttention, (raw) => {
      const e = raw as AttentionEvent;
      const session = this.state.sessions.get(e.sessionId);
      if (!session) return;
      // Don't badge the currently focused tab — the user is already on it.
      if (this.state.focusedId === e.sessionId) return;
      session.attention = true;
      session.info = { ...session.info, status: 'awaiting-input' };
      session.statusSinceMs = Date.now();
      this.render();
    });

    // Pull initial session list (main may have already spawned the boot session).
    const list = (await this.bridge.send(IpcChannel.SessionList)) as SessionInfo[];
    for (const info of list) this.upsertSession(info);
    if (!this.state.focusedId && this.state.tabOrder[0]) this.focus(this.state.tabOrder[0]);

    // Tick sidebar time-in-state once per second.
    this.tickHandle = setInterval(() => this.render(), 1_000);

    this.render();
  }

  // --- Public actions invoked by TabStrip/Sidebar callbacks and keyboard ---

  async newTab(): Promise<void> {
    const info = (await this.bridge.send(IpcChannel.SessionCreateDefault)) as
      | SessionInfo
      | { error: string };
    if ('error' in info) {
      console.error('[chrome] new tab failed:', info.error);
      return;
    }
    // SessionCreated event will arrive and populate state; nothing else to do.
  }

  async closeTab(sessionId: SessionId): Promise<void> {
    await this.bridge.send(IpcChannel.SessionClose, { sessionId });
    // Local cleanup happens lazily on the SessionExited event. Optimistically remove tab
    // ordering so the UI feels responsive.
    this.state.sessions.delete(sessionId);
    this.state.tabOrder = this.state.tabOrder.filter((id) => id !== sessionId);
    if (this.state.focusedId === sessionId) {
      this.state.focusedId = this.state.tabOrder[this.state.tabOrder.length - 1] ?? null;
      if (this.state.focusedId) this.bridge.send(IpcChannel.LayoutShow, { sessionId: this.state.focusedId });
    }
    this.render();
  }

  focus(sessionId: SessionId): void {
    if (!this.state.sessions.has(sessionId)) return;
    this.state.focusedId = sessionId;
    const session = this.state.sessions.get(sessionId)!;
    if (session.attention) {
      session.attention = false; // clear badge on focus
    }
    void this.bridge.send(IpcChannel.LayoutShow, { sessionId });
    this.render();
  }

  focusNext(): void {
    if (this.state.tabOrder.length === 0) return;
    const idx = this.state.focusedId ? this.state.tabOrder.indexOf(this.state.focusedId) : -1;
    const next = this.state.tabOrder[(idx + 1) % this.state.tabOrder.length]!;
    this.focus(next);
  }

  focusPrev(): void {
    if (this.state.tabOrder.length === 0) return;
    const idx = this.state.focusedId ? this.state.tabOrder.indexOf(this.state.focusedId) : 0;
    const prev = this.state.tabOrder[(idx - 1 + this.state.tabOrder.length) % this.state.tabOrder.length]!;
    this.focus(prev);
  }

  focusIndex(oneBasedIndex: number): void {
    const target = this.state.tabOrder[oneBasedIndex - 1];
    if (target) this.focus(target);
  }

  closeFocused(): void {
    if (this.state.focusedId) void this.closeTab(this.state.focusedId);
  }

  toggleSidebar(): void {
    this.state.sidebarOpen = !this.state.sidebarOpen;
    this.bodyEl.classList.toggle('sidebar-collapsed', !this.state.sidebarOpen);
    document.body.classList.toggle('sidebar-collapsed', !this.state.sidebarOpen);
    this.render();
  }

  // --- Internals ---

  private upsertSession(info: SessionInfo): void {
    const existing = this.state.sessions.get(info.id);
    if (existing) {
      const statusChanged = existing.info.status !== info.status;
      existing.info = info;
      if (statusChanged) existing.statusSinceMs = Date.now();
    } else {
      const fresh: SessionState = {
        info,
        attention: false,
        statusSinceMs: Date.now(),
      };
      this.state.sessions.set(info.id, fresh);
      this.state.tabOrder.push(info.id);
    }
    this.render();
  }

  private render(): void {
    const tabs: TabViewModel[] = this.state.tabOrder
      .map((id) => this.state.sessions.get(id))
      .filter((s): s is SessionState => !!s)
      .map((s) => ({ info: s.info, attention: s.attention }));
    this.tabStrip.render(tabs, this.state.focusedId);

    const rows: SidebarRowVm[] = this.state.tabOrder
      .map((id) => this.state.sessions.get(id))
      .filter((s): s is SessionState => !!s)
      .map((s) => ({ info: s.info, attention: s.attention, statusSinceMs: s.statusSinceMs }));
    this.sidebar.render(rows, this.state.focusedId);
  }
}
```

- [ ] **Step 3: Replace `apps/desktop/src/renderer/chrome/main.ts`**

```ts
import type { PreloadBridge } from '@aipad/terminal-host';
import { TabStrip } from './tab-strip.js';
import { Sidebar } from './sidebar.js';
import { LayoutManager } from './layout-manager.js';

const bridge = (window as unknown as { aipad: PreloadBridge }).aipad;

const tabStripEl = document.getElementById('tab-strip')!;
const sidebarListEl = document.getElementById('sidebar-list')!;
const sidebarToggleEl = document.getElementById('sidebar-toggle')!;
const bodyEl = document.getElementById('body')!;

const manager = new LayoutManager({
  bridge,
  bodyEl,
  tabStrip: new TabStrip(tabStripEl, {
    onTabClick: (id) => manager.focus(id),
    onTabClose: (id) => void manager.closeTab(id),
    onNewTab: () => void manager.newTab(),
  }),
  sidebar: new Sidebar({
    listEl: sidebarListEl,
    toggleEl: sidebarToggleEl,
    callbacks: {
      onRowClick: (id) => manager.focus(id),
      onToggle: () => manager.toggleSidebar(),
    },
  }),
});

void manager.start();

// Expose for keyboard handler (T14).
(window as unknown as { __aipadLayout: LayoutManager }).__aipadLayout = manager;

console.info('[chrome] mounted');
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @aipad/desktop typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/chrome/state.ts apps/desktop/src/renderer/chrome/layout-manager.ts apps/desktop/src/renderer/chrome/main.ts
git commit -m "feat(chrome): LayoutManager state + IPC orchestration; wire TabStrip + Sidebar"
```

---

## Task 14: `@aipad/keymap` extension + chrome keyboard handler

**Files:**
- Modify: `packages/keymap/src/index.ts`
- Create: `apps/desktop/src/renderer/chrome/keyboard.ts`
- Modify: `apps/desktop/src/renderer/chrome/main.ts`

- [ ] **Step 1: Replace `packages/keymap/src/index.ts`**

```ts
/**
 * Plan 1 shipped a minimal registry. Plan 2 adds tab and sidebar shortcuts.
 * Plan 3 will add split shortcuts (Ctrl+\, Ctrl+Shift+\).
 */
export interface KeyBinding {
  id: string;
  description: string;
  /** Electron accelerator syntax. The chrome renderer maps these to keydown matches. */
  accelerator: string;
}

export const Bindings = {
  newTab:        { id: 'newTab',        description: 'New tab',           accelerator: 'CmdOrCtrl+T' },
  closeTab:      { id: 'closeTab',      description: 'Close tab',         accelerator: 'CmdOrCtrl+W' },
  nextTab:       { id: 'nextTab',       description: 'Next tab',          accelerator: 'CmdOrCtrl+Tab' },
  prevTab:       { id: 'prevTab',       description: 'Previous tab',      accelerator: 'CmdOrCtrl+Shift+Tab' },
  jumpTab1:      { id: 'jumpTab1',      description: 'Switch to tab 1',   accelerator: 'CmdOrCtrl+1' },
  jumpTab2:      { id: 'jumpTab2',      description: 'Switch to tab 2',   accelerator: 'CmdOrCtrl+2' },
  jumpTab3:      { id: 'jumpTab3',      description: 'Switch to tab 3',   accelerator: 'CmdOrCtrl+3' },
  jumpTab4:      { id: 'jumpTab4',      description: 'Switch to tab 4',   accelerator: 'CmdOrCtrl+4' },
  jumpTab5:      { id: 'jumpTab5',      description: 'Switch to tab 5',   accelerator: 'CmdOrCtrl+5' },
  jumpTab6:      { id: 'jumpTab6',      description: 'Switch to tab 6',   accelerator: 'CmdOrCtrl+6' },
  jumpTab7:      { id: 'jumpTab7',      description: 'Switch to tab 7',   accelerator: 'CmdOrCtrl+7' },
  jumpTab8:      { id: 'jumpTab8',      description: 'Switch to tab 8',   accelerator: 'CmdOrCtrl+8' },
  jumpTab9:      { id: 'jumpTab9',      description: 'Switch to tab 9',   accelerator: 'CmdOrCtrl+9' },
  toggleSidebar: { id: 'toggleSidebar', description: 'Toggle sidebar',    accelerator: 'CmdOrCtrl+B' },
} as const satisfies Record<string, KeyBinding>;

export type BindingId = keyof typeof Bindings;
```

- [ ] **Step 2: Build keymap**

Run: `pnpm --filter @aipad/keymap build`
Expected: no errors.

- [ ] **Step 3: Create `apps/desktop/src/renderer/chrome/keyboard.ts`**

```ts
import { Bindings, type BindingId } from '@aipad/keymap';
import type { LayoutManager } from './layout-manager.js';

interface ParsedAccelerator {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string; // uppercase
}

function parseAccelerator(acc: string): ParsedAccelerator {
  const parts = acc.split('+').map((p) => p.trim());
  const result: ParsedAccelerator = { ctrl: false, shift: false, alt: false, key: '' };
  for (const part of parts) {
    if (part === 'CmdOrCtrl' || part === 'Ctrl' || part === 'Cmd') result.ctrl = true;
    else if (part === 'Shift') result.shift = true;
    else if (part === 'Alt' || part === 'Option') result.alt = true;
    else result.key = part.toUpperCase();
  }
  return result;
}

function eventMatches(ev: KeyboardEvent, acc: ParsedAccelerator): boolean {
  const ctrlPressed = ev.ctrlKey || ev.metaKey;
  if (!!acc.ctrl !== ctrlPressed) return false;
  if (!!acc.shift !== ev.shiftKey) return false;
  if (!!acc.alt !== ev.altKey) return false;
  return ev.key.toUpperCase() === acc.key || ev.code.toUpperCase() === acc.key
    // Map `Tab` literal to the actual Tab key
    || (acc.key === 'TAB' && ev.key === 'Tab');
}

const ACTION_HANDLERS: Record<BindingId, (m: LayoutManager) => void> = {
  newTab: (m) => void m.newTab(),
  closeTab: (m) => m.closeFocused(),
  nextTab: (m) => m.focusNext(),
  prevTab: (m) => m.focusPrev(),
  jumpTab1: (m) => m.focusIndex(1),
  jumpTab2: (m) => m.focusIndex(2),
  jumpTab3: (m) => m.focusIndex(3),
  jumpTab4: (m) => m.focusIndex(4),
  jumpTab5: (m) => m.focusIndex(5),
  jumpTab6: (m) => m.focusIndex(6),
  jumpTab7: (m) => m.focusIndex(7),
  jumpTab8: (m) => m.focusIndex(8),
  jumpTab9: (m) => m.focusIndex(9),
  toggleSidebar: (m) => m.toggleSidebar(),
};

export function wireKeyboard(manager: LayoutManager): void {
  const parsed: Array<{ id: BindingId; acc: ParsedAccelerator }> = Object.entries(Bindings).map(
    ([id, binding]) => ({ id: id as BindingId, acc: parseAccelerator(binding.accelerator) }),
  );

  document.addEventListener('keydown', (ev) => {
    for (const { id, acc } of parsed) {
      if (eventMatches(ev, acc)) {
        ev.preventDefault();
        ev.stopPropagation();
        ACTION_HANDLERS[id](manager);
        return;
      }
    }
  });
}
```

- [ ] **Step 4: Wire `wireKeyboard` from `chrome/main.ts`**

Append two lines to `apps/desktop/src/renderer/chrome/main.ts` just before the final `console.info`:

```ts
import { wireKeyboard } from './keyboard.js';
// ... existing imports + setup ...

wireKeyboard(manager);

console.info('[chrome] mounted');
```

(Make sure the import sits with the other imports at top of the file; the `wireKeyboard(manager)` call sits just above the existing `console.info`.)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @aipad/desktop typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/keymap/src/index.ts apps/desktop/src/renderer/chrome/keyboard.ts apps/desktop/src/renderer/chrome/main.ts
git commit -m "feat(keymap+chrome): add Plan 2 bindings and keydown handler"
```

---

## Task 15: Wire `NotificationService` into main

**Files:**
- Create: `apps/desktop/src/main/notification-bridge.ts`
- Modify: `apps/desktop/src/main/index.ts`

`NotificationService` from `@aipad/core` is implementation-agnostic — main injects Electron's real `Notification` constructor and registers a click handler that focuses + activates the relevant tab.

The decision "should we fire a notification?" lives here: yes IF (a) the chrome window is not focused, OR (b) the focused tab is not the one signaling attention.

- [ ] **Step 1: Create `apps/desktop/src/main/notification-bridge.ts`**

```ts
import { BrowserWindow, Notification } from 'electron';
import type { SessionManager, IpcRouter } from '@aipad/core';
import { NotificationService } from '@aipad/core';
import type { AttentionEvent, SessionId } from '@aipad/contracts';
import { IpcChannel } from '@aipad/contracts';
import type { ViewManager } from './view-manager.js';

export interface NotificationBridgeDeps {
  sessionManager: SessionManager;
  ipcRouter: IpcRouter;
  viewManager: () => ViewManager | null;
  chromeWindow: () => BrowserWindow | null;
  focusedSessionId: () => SessionId | null;
}

export class NotificationBridge {
  private readonly service: NotificationService;

  constructor(private readonly deps: NotificationBridgeDeps) {
    this.service = new NotificationService(Notification as unknown as new (opts: { title: string; body: string }) => InstanceType<typeof Notification>);
    this.service.onClick((sessionId) => this.handleClick(sessionId));
    this.deps.sessionManager.on('sessionAttention', (ev) => this.handleAttention(ev));
  }

  private handleAttention(ev: AttentionEvent): void {
    const win = this.deps.chromeWindow();
    const focused = this.deps.focusedSessionId();
    const windowFocused = win?.isFocused() ?? false;
    const tabFocused = focused === ev.sessionId;
    if (windowFocused && tabFocused) return;
    const info = this.deps.sessionManager.list().find((s) => s.id === ev.sessionId);
    const title = info?.title ?? 'AI.Pad session';
    this.service.notify({
      sessionId: ev.sessionId,
      title: `${title} needs you`,
      body: ev.snippet?.trim().slice(0, 240) ?? `Signal: ${ev.signal}`,
    });
  }

  private handleClick(sessionId: SessionId): void {
    const win = this.deps.chromeWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    const vm = this.deps.viewManager();
    vm?.show(sessionId);
    // Also tell the chrome renderer to update its focused tab + clear the badge.
    win?.webContents.send(IpcChannel.LayoutShow, { sessionId });
  }
}
```

- [ ] **Step 2: Wire `NotificationBridge` into `apps/desktop/src/main/index.ts`**

Open the file. Near the top, add the import:

```ts
import { NotificationBridge } from './notification-bridge.js';
```

Add a module-level tracker for the currently focused session id (the chrome's LayoutManager owns the authoritative value, but we keep a local mirror updated via the `LayoutShow` handler):

Replace this existing block:

```ts
ipcRouter.onLayoutShow((sessionId) => {
  viewManager?.show(sessionId);
});
```

with:

```ts
let focusedSessionId: string | null = null;
ipcRouter.onLayoutShow((sessionId) => {
  focusedSessionId = sessionId;
  viewManager?.show(sessionId);
});
```

Then near the bottom of `createChromeWindow()` (just after `chromeWindow.on('closed', ...)`), add:

```ts
  new NotificationBridge({
    sessionManager,
    ipcRouter,
    viewManager: () => viewManager,
    chromeWindow: () => chromeWindow,
    focusedSessionId: () => focusedSessionId,
  });
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aipad/desktop typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/notification-bridge.ts apps/desktop/src/main/index.ts
git commit -m "feat(desktop): NotificationBridge fires OS notifications on attention; click focuses tab"
```

---

## Task 16: Polish — strengthen E2E smoke + replace dead waitFor + macOS activate sanity

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `tests/integration/session-manager.test.ts`

T11's macOS `activate` handler is already in main (T8 added it). T16 strengthens the Plan 1 smoke so a silent renderer failure like the `.mjs` preload bug would fail the test next time, and fixes the `waitFor(() => true, 200)` no-op carried over from Plan 1.

- [ ] **Step 1: Replace `tests/e2e/smoke.spec.ts`**

```ts
import { _electron as electron, expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('app launches; chrome renders; renderer console has no errors', async () => {
  const errors: string[] = [];

  const electronApp = await electron.launch({
    args: [resolve(__dirname, '../../apps/desktop')],
    env: { ...process.env, NODE_ENV: 'production' },
  });

  electronApp.on('window', (page) => {
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
  });

  const chrome = await electronApp.firstWindow();
  await expect(chrome.locator('#tab-strip')).toBeVisible();
  await expect(chrome.locator('#sidebar')).toBeVisible();

  // Wait briefly for any startup errors to surface.
  await chrome.waitForTimeout(1500);

  expect(errors, errors.join('\n')).toEqual([]);

  await electronApp.close();
});
```

- [ ] **Step 2: Replace the dead `waitFor(() => true, 200)` in integration tests**

Open `tests/integration/session-manager.test.ts`. Find the line:

```ts
    await waitFor(() => true, 200);
```

Replace with:

```ts
    await new Promise((r) => setTimeout(r, 200));
```

- [ ] **Step 3: Build and run all tests**

Run: `pnpm --filter @aipad/desktop build && pnpm test && pnpm test:e2e`
Expected: all green. Plan 1's 10 unit/integration tests + Plan 2's 18 new (12 AttentionDetector + 6 NotificationService) = 28 tests via `pnpm test`. `pnpm test:e2e` still 1 test, now stricter.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/smoke.spec.ts tests/integration/session-manager.test.ts
git commit -m "test: strengthen E2E smoke (no console errors); fix dead waitFor"
```

---

## Task 17: Integration test — AttentionDetector with real PTY

**Files:**
- Create: `tests/integration/attention-detector.test.ts`

Use a real PTY (PowerShell on Windows, bash on Linux/macOS) to write a BEL through `Write-Host` / `printf` and assert that `SessionManager` emits `sessionAttention`.

- [ ] **Step 1: Create `tests/integration/attention-detector.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homedir, platform } from 'node:os';
import { SessionManager } from '@aipad/core';
import type { Shell, AttentionEvent } from '@aipad/contracts';

function defaultShell(): Shell {
  if (platform() === 'win32') return 'pwsh';
  if (platform() === 'darwin') return 'zsh';
  return 'bash';
}

async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('AttentionDetector + real PTY', () => {
  let manager: SessionManager;

  beforeEach(() => { manager = new SessionManager(); });
  afterEach(async () => { await manager.closeAll(); });

  it('emits sessionAttention when the shell prints a BEL byte', async () => {
    const session = manager.create({ shell: defaultShell(), cwd: homedir(), cols: 80, rows: 24 });
    const events: AttentionEvent[] = [];
    manager.on('sessionAttention', (ev) => events.push(ev));

    // Let the prompt print first to flush startup noise.
    await new Promise((r) => setTimeout(r, 400));

    // Write a BEL via the shell. PowerShell: `[char]7` works; bash: printf '\a'.
    const cmd = platform() === 'win32' ? `[char]7 | Write-Host -NoNewline\r` : `printf '\\a'\r`;
    session.write(cmd);

    await waitFor(() => events.some((e) => e.signal === 'bell'));
    const bell = events.find((e) => e.signal === 'bell');
    expect(bell).toBeDefined();
    expect(bell?.sessionId).toBe(session.id);
    expect(bell?.confidence).toBe(1);
  });

  it('does not emit sessionAttention for ordinary prompt output', async () => {
    const session = manager.create({ shell: defaultShell(), cwd: homedir(), cols: 80, rows: 24 });
    const events: AttentionEvent[] = [];
    manager.on('sessionAttention', (ev) => events.push(ev));

    session.write(`echo hello\r`);
    await new Promise((r) => setTimeout(r, 1200));

    expect(events).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter @aipad/integration test`
Expected: 3 Plan-1 tests + 2 Plan-2 tests = 5 passing.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/attention-detector.test.ts
git commit -m "test(integration): AttentionDetector + real PTY BEL round-trip"
```

---

## Task 18: Playwright E2E — multi-tab + attention badge

**Files:**
- Create: `tests/e2e/multi-tab.spec.ts`

Open 2 tabs, run a PowerShell command in tab 2 that emits a BEL while tab 1 is focused, assert tab 2 shows the attention badge in the chrome tab strip (yellow `.dot.attention` class).

The terminal view's PTY is driven by typing into the xterm of the focused tab, but Playwright can't reach into a `WebContentsView`'s DOM. Workaround: send keystrokes via the chrome window's IPC bridge using `page.evaluate` to call `window.aipad.send(IpcChannel.SessionWrite, ...)` against the second session's id. This stays at the contract level and avoids xterm internals.

- [ ] **Step 1: Create `tests/e2e/multi-tab.spec.ts`**

```ts
import { _electron as electron, expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('opening a 2nd tab and triggering BEL badges the inactive tab', async () => {
  const electronApp = await electron.launch({
    args: [resolve(__dirname, '../../apps/desktop')],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const chrome = await electronApp.firstWindow();

  // Wait for the initial tab to appear (sessionList + sessionCreated should populate it).
  await expect(chrome.locator('#tab-strip .tab')).toHaveCount(1, { timeout: 8_000 });

  // Open a 2nd tab via the chrome's "+" button.
  await chrome.locator('#new-tab').click();
  await expect(chrome.locator('#tab-strip .tab')).toHaveCount(2, { timeout: 8_000 });

  // Click back to the first tab so the second is unfocused.
  const firstTabId = await chrome.locator('#tab-strip .tab').nth(0).getAttribute('data-session-id');
  const secondTabId = await chrome.locator('#tab-strip .tab').nth(1).getAttribute('data-session-id');
  expect(firstTabId).toBeTruthy();
  expect(secondTabId).toBeTruthy();
  await chrome.locator(`#tab-strip .tab[data-session-id="${firstTabId}"]`).click();

  // Write a BEL-producing command to the SECOND session via IPC.
  // PowerShell on Windows: `[char]7 | Write-Host -NoNewline\r`
  const bellCmd = process.platform === 'win32'
    ? '[char]7 | Write-Host -NoNewline\r'
    : `printf '\\a'\r`;
  await chrome.evaluate(async ({ id, cmd }) => {
    const aipad = (window as unknown as { aipad: { send: (c: string, p: unknown) => Promise<unknown> } }).aipad;
    const data = btoa(unescape(encodeURIComponent(cmd)));
    await aipad.send('core.session.write', { sessionId: id, data });
  }, { id: secondTabId!, cmd: bellCmd });

  // Wait for the attention dot to appear on the second tab.
  await expect(
    chrome.locator(`#tab-strip .tab[data-session-id="${secondTabId}"] .dot.attention`),
  ).toBeVisible({ timeout: 6_000 });

  await electronApp.close();
});
```

- [ ] **Step 2: Build and run**

Run: `pnpm --filter @aipad/desktop build && pnpm test:e2e`
Expected: 2 E2E tests passing (smoke + multi-tab).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/multi-tab.spec.ts
git commit -m "test(e2e): Playwright multi-tab attention-badge round-trip"
```

---

## Task 19: README + Plan 2 sign-off + tag

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Status table and add a Shortcuts section**

In `README.md`, change the row for Plan 2 from `not started` to `complete`. Then add a new section after the existing "Verify your install" block:

```md
## Keyboard shortcuts (Plan 2)

| Shortcut | Action |
|---|---|
| `Ctrl+T` | New tab (default shell at `$HOME`) |
| `Ctrl+W` | Close focused tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+1` … `Ctrl+9` | Jump to tab 1–9 |
| `Ctrl+B` | Toggle sidebar |

When a background tab needs your input (e.g., an agent prompts you), the tab badges with a yellow dot and a desktop notification fires (unless that tab is already focused). Clicking the notification focuses the window and switches to that tab.
```

- [ ] **Step 2: Full pipeline check**

Run: `pnpm install && pnpm -r build && pnpm test && pnpm test:e2e`
Expected: all green.

- [ ] **Step 3: Manual verification (controller)**

`pnpm dev` and walk through:
- Initial tab opens with a PowerShell prompt.
- `Ctrl+T` opens a 2nd tab.
- Run `[char]7 | Write-Host -NoNewline` in tab 2 while focused on tab 1 → tab 2 badges yellow; if the window is unfocused, OS notification fires.
- `Ctrl+B` toggles the sidebar.
- Closing the window cleanly exits all PTYs.

- [ ] **Step 4: Commit + tag**

```bash
git add README.md
git commit -m "docs: mark Plan 2 — Multi-tab + attention complete; add shortcuts table"
git tag stage1-plan2-multi-tab
```

---

## Plan 2 done. Next: Plan 3 — Splits + persistence + packaging

When Plan 2 lands, Plan 3 covers:

- VS-Code-style horizontal/vertical splits within a tab
- Session persistence across app restarts (cwd, shell, title, layout — fresh PTYs)
- NewSessionDialog (per-tab shell + cwd picker)
- Cross-platform CI matrix (Windows + macOS + Linux)
- electron-builder packaging targets (NSIS / DMG / AppImage) + auto-update
- Idle-prompt heuristic in AttentionDetector
- Tab reorder + sidebar context menu (rename / duplicate)

Plan 3 will be written once Plan 2's tag is in place and the user has verified the multi-tab + attention experience.
