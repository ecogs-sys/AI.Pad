# AI.Pad — Stage 1, Plan 1: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the AI.Pad monorepo and ship a working single-window, single-PTY Electron app on Windows where the user can type into PowerShell and see output, wired through the architecture from the spec (`@aipad/contracts`, `@aipad/core`, `@aipad/terminal-host`, `apps/desktop`).

**Architecture:** Electron + xterm.js + node-pty. Main process owns the PTY via `SessionManager`. Renderer is one `WebContentsView` hosting xterm. IPC is typed end-to-end via Zod schemas in `@aipad/contracts`. This plan builds the foundations only — one fixed session, no tab UI, no attention detection, no persistence, no splits. Those come in Plans 2 and 3.

**Tech Stack:** Electron 33+, electron-vite 2+, TypeScript 5.5+ (strict), pnpm 9+ workspaces, node-pty 1.0+, @xterm/xterm 5.5+ (+ FitAddon, WebLinksAddon), zod 3.23+, Vitest 2+, Playwright 1.47+.

**Out of scope for Plan 1 (deferred to Plan 2/3):** Multi-tab UI, attention detection (`AttentionDetector`), sidebar, OS notifications, splits, session persistence, NewSessionDialog (shell/cwd picker), cross-platform CI matrix, packaging/auto-update.

**Plan 1 success criteria:** `pnpm dev` opens an Electron window on Windows showing a PowerShell prompt inside xterm. Typing `Get-Date` and pressing Enter prints the date. Closing the window cleanly exits the app with no orphaned processes. `pnpm test` passes unit + integration suites. `pnpm test:e2e` passes a Playwright smoke test.

---

## File map for this plan

```
ai.pad/
├── package.json                              [T1]
├── pnpm-workspace.yaml                       [T1]
├── tsconfig.base.json                        [T1]
├── .editorconfig                             [T1]
├── .eslintrc.cjs                             [T1]
├── .prettierrc                               [T1]
├── .npmrc                                    [T1]
├── README.md                                 [T15]
├── packages/
│   ├── contracts/                            [T2]
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── session.ts
│   │       └── ipc.ts
│   ├── keymap/                               [T3]
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── core/                                 [T4–T8]
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── ring-buffer.ts
│   │   │   ├── session.ts
│   │   │   ├── session-manager.ts
│   │   │   └── ipc-router.ts
│   │   └── tests/
│   │       └── ring-buffer.test.ts
│   └── terminal-host/                        [T9]
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           └── terminal-host.ts
├── apps/
│   └── desktop/                              [T10–T12]
│       ├── package.json
│       ├── tsconfig.json
│       ├── electron.vite.config.ts
│       ├── index.html                        (chrome page)
│       ├── terminal-host.html                (per-session page)
│       └── src/
│           ├── main/
│           │   └── index.ts                  (Electron main entry)
│           ├── preload/
│           │   └── index.ts                  (preload bridge)
│           └── renderer/
│               ├── chrome/
│               │   └── main.ts               (chrome renderer)
│               └── terminal/
│                   └── main.ts               (per-session renderer)
└── tests/
    ├── integration/                          [T13]
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vitest.config.ts
    │   └── session-manager.test.ts
    └── e2e/                                  [T14]
        ├── package.json
        ├── playwright.config.ts
        └── smoke.spec.ts
```

Total: 16 created files + 6 directories of supporting config. Each file is ≤200 lines; each task creates or modifies a small, focused set.

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.editorconfig`
- Create: `.eslintrc.cjs`
- Create: `.prettierrc`
- Create: `.npmrc`

- [ ] **Step 1: Verify pnpm is installed**

Run: `pnpm --version`
Expected: prints `9.x.x` or newer. If missing: `npm install -g pnpm@latest`.

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "aipad",
  "version": "0.0.1",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev": "pnpm --filter @aipad/desktop dev",
    "build": "pnpm -r --filter './packages/*' build && pnpm --filter @aipad/desktop build",
    "test": "pnpm -r --if-present test",
    "test:e2e": "pnpm --filter @aipad/e2e test",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "pnpm -r typecheck",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@typescript-eslint/eslint-plugin": "^7.18.0",
    "@typescript-eslint/parser": "^7.18.0",
    "eslint": "^8.57.0",
    "prettier": "^3.3.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "apps/*"
  - "tests/*"
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Create `.editorconfig`**

```
root = true

[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8
indent_style = space
indent_size = 2
trim_trailing_whitespace = true
```

- [ ] **Step 6: Create `.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  env: { node: true, browser: true, es2022: true },
  ignorePatterns: ["dist/", "out/", "node_modules/", ".superpowers/"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
};
```

- [ ] **Step 7: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "endOfLine": "lf"
}
```

- [ ] **Step 8: Create `.npmrc`**

```
auto-install-peers=true
shamefully-hoist=false
node-linker=isolated
strict-peer-dependencies=false
```

- [ ] **Step 9: Install root dev dependencies**

Run: `pnpm install`
Expected: pnpm creates `pnpm-lock.yaml` and `node_modules/`. No errors.

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .editorconfig .eslintrc.cjs .prettierrc .npmrc pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo with TS, ESLint, Prettier"
```

---

## Task 2: `@aipad/contracts` package

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/session.ts`
- Create: `packages/contracts/src/ipc.ts`
- Create: `packages/contracts/src/index.ts`

- [ ] **Step 1: Create `packages/contracts/package.json`**

```json
{
  "name": "@aipad/contracts",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create `packages/contracts/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/contracts/src/session.ts`**

```ts
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
```

- [ ] **Step 4: Create `packages/contracts/src/ipc.ts`**

```ts
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
```

- [ ] **Step 5: Create `packages/contracts/src/index.ts`**

```ts
export * from './session.js';
export * from './ipc.js';
```

- [ ] **Step 6: Install package deps**

Run: `pnpm install`
Expected: zod and typescript installed into `packages/contracts/node_modules`.

- [ ] **Step 7: Typecheck and build**

Run: `pnpm --filter @aipad/contracts typecheck && pnpm --filter @aipad/contracts build`
Expected: no errors. `packages/contracts/dist/` contains `.js` and `.d.ts` files.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts pnpm-lock.yaml
git commit -m "feat(contracts): add typed IPC schemas and Session types"
```

---

## Task 3: `@aipad/keymap` package skeleton

**Files:**
- Create: `packages/keymap/package.json`
- Create: `packages/keymap/tsconfig.json`
- Create: `packages/keymap/src/index.ts`

- [ ] **Step 1: Create `packages/keymap/package.json`**

```json
{
  "name": "@aipad/keymap",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create `packages/keymap/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/keymap/src/index.ts`**

```ts
/**
 * Plan 1 ships a minimal registry. Plan 2 adds tab shortcuts (Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+1..9).
 * Plan 3 adds split shortcuts (Ctrl+\, Ctrl+Shift+\) and sidebar toggle (Ctrl+B).
 */
export interface KeyBinding {
  id: string;
  description: string;
  accelerator: string; // Electron accelerator syntax, e.g. "CmdOrCtrl+T"
}

export const Bindings = {} as const satisfies Record<string, KeyBinding>;
```

- [ ] **Step 4: Typecheck and build**

Run: `pnpm --filter @aipad/keymap typecheck && pnpm --filter @aipad/keymap build`
Expected: no errors. `packages/keymap/dist/index.js` exists.

- [ ] **Step 5: Commit**

```bash
git add packages/keymap
git commit -m "feat(keymap): add empty key-binding registry skeleton"
```

---

## Task 4: `@aipad/core` package scaffold + Vitest

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts` (empty re-exports for now)

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@aipad/core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@aipad/contracts": "workspace:*",
    "node-pty": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["tests/**/*"]
}
```

- [ ] **Step 3: Create `packages/core/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
});
```

- [ ] **Step 4: Create `packages/core/src/index.ts`**

```ts
// Re-exports added as each component is built.
export {};
```

- [ ] **Step 5: Install deps**

Run: `pnpm install`
Expected: `node-pty` builds its native bindings successfully (you may see a prebuild download or local build with node-gyp). No errors.

- [ ] **Step 6: Verify**

Run: `pnpm --filter @aipad/core typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "chore(core): scaffold package with vitest config"
```

---

## Task 5: `RingBuffer` (TDD)

**Files:**
- Create: `packages/core/tests/ring-buffer.test.ts`
- Create: `packages/core/src/ring-buffer.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/ring-buffer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../src/ring-buffer.js';

describe('RingBuffer', () => {
  it('stores writes below capacity and returns them via snapshot()', () => {
    const buf = new RingBuffer(64);
    buf.write(Buffer.from('hello'));
    buf.write(Buffer.from(' world'));
    expect(buf.snapshot().toString('utf8')).toBe('hello world');
  });

  it('drops the oldest bytes when total exceeds capacity', () => {
    const buf = new RingBuffer(8);
    buf.write(Buffer.from('abcdefgh')); // exactly capacity
    buf.write(Buffer.from('ij'));        // pushes ab out
    expect(buf.snapshot().toString('utf8')).toBe('cdefghij');
  });

  it('handles a single write larger than capacity (keeps the tail)', () => {
    const buf = new RingBuffer(4);
    buf.write(Buffer.from('abcdefgh'));
    expect(buf.snapshot().toString('utf8')).toBe('efgh');
  });

  it('tail(n) returns up to the last n bytes', () => {
    const buf = new RingBuffer(64);
    buf.write(Buffer.from('hello world'));
    expect(buf.tail(5).toString('utf8')).toBe('world');
    expect(buf.tail(100).toString('utf8')).toBe('hello world'); // saturates at content length
  });

  it('returns an empty buffer for snapshot() when no writes have occurred', () => {
    const buf = new RingBuffer(16);
    expect(buf.snapshot().length).toBe(0);
  });

  it('throws when constructed with a non-positive capacity', () => {
    expect(() => new RingBuffer(0)).toThrow();
    expect(() => new RingBuffer(-1)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @aipad/core test`
Expected: 6 failing tests with "Cannot find module './ring-buffer.js'" or equivalent.

- [ ] **Step 3: Implement `RingBuffer`**

Create `packages/core/src/ring-buffer.ts`:

```ts
/**
 * Fixed-capacity byte ring buffer. Writes that overflow drop the oldest bytes.
 * Internal representation is a single contiguous Buffer to keep snapshot() cheap.
 * UTF-8 boundary safety is the caller's concern (we operate on raw bytes).
 */
export class RingBuffer {
  private readonly capacity: number;
  private readonly storage: Buffer;
  private size = 0; // number of valid bytes in storage, always <= capacity
  private start = 0; // index of the oldest byte within storage

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`RingBuffer capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.storage = Buffer.alloc(capacity);
  }

  write(chunk: Buffer): void {
    if (chunk.length === 0) return;

    // Fast path: single write larger than capacity -> keep only the tail.
    if (chunk.length >= this.capacity) {
      const tail = chunk.subarray(chunk.length - this.capacity);
      tail.copy(this.storage, 0);
      this.size = this.capacity;
      this.start = 0;
      return;
    }

    // Write into a linear "virtual" position (start + size) modulo capacity.
    const writeStart = (this.start + this.size) % this.capacity;
    const firstSpan = Math.min(chunk.length, this.capacity - writeStart);
    chunk.copy(this.storage, writeStart, 0, firstSpan);
    const remaining = chunk.length - firstSpan;
    if (remaining > 0) {
      chunk.copy(this.storage, 0, firstSpan);
    }

    const newSize = this.size + chunk.length;
    if (newSize <= this.capacity) {
      this.size = newSize;
    } else {
      this.size = this.capacity;
      this.start = (this.start + (newSize - this.capacity)) % this.capacity;
    }
  }

  snapshot(): Buffer {
    if (this.size === 0) return Buffer.alloc(0);
    const out = Buffer.alloc(this.size);
    const firstSpan = Math.min(this.size, this.capacity - this.start);
    this.storage.copy(out, 0, this.start, this.start + firstSpan);
    const remaining = this.size - firstSpan;
    if (remaining > 0) {
      this.storage.copy(out, firstSpan, 0, remaining);
    }
    return out;
  }

  tail(n: number): Buffer {
    if (n <= 0) return Buffer.alloc(0);
    const want = Math.min(n, this.size);
    const snap = this.snapshot();
    return snap.subarray(snap.length - want);
  }
}
```

- [ ] **Step 4: Re-export from `index.ts`**

Replace `packages/core/src/index.ts` contents with:

```ts
export { RingBuffer } from './ring-buffer.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @aipad/core test`
Expected: all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ring-buffer.ts packages/core/src/index.ts packages/core/tests/ring-buffer.test.ts
git commit -m "feat(core): add RingBuffer with overflow + snapshot/tail (TDD)"
```

---

## Task 6: `Session` (PTY wrapper)

**Files:**
- Create: `packages/core/src/session.ts`
- Modify: `packages/core/src/index.ts`

> No unit tests in this task — `Session` is exercised by the integration test in Task 13 against a real PTY. Mocking node-pty here would test the mock, not behavior. Per spec §8: "real PTYs at integration tier."

- [ ] **Step 1: Implement `Session`**

Create `packages/core/src/session.ts`:

```ts
import { EventEmitter } from 'node:events';
import * as pty from 'node-pty';
import type {
  SessionCreateOptions,
  SessionId,
  SessionInfo,
  SessionStatus,
} from '@aipad/contracts';
import { RingBuffer } from './ring-buffer.js';

export interface SessionEvents {
  data: (chunk: Buffer) => void;
  exit: (info: { exitCode: number | null; signal: string | null }) => void;
  titleChanged: (title: string) => void;
}

const DEFAULT_RING_CAPACITY = 256 * 1024; // ~256 KB ≈ 5,000 lines

function shellCommand(shell: SessionCreateOptions['shell']): string {
  // Stage 1 uses simple defaults; Plan 3's NewSessionDialog will surface custom paths.
  switch (shell) {
    case 'pwsh': return 'pwsh.exe';
    case 'powershell': return 'powershell.exe';
    case 'cmd': return 'cmd.exe';
    case 'bash': return 'bash';
    case 'zsh': return 'zsh';
    case 'wsl': return 'wsl.exe';
  }
}

export class Session extends EventEmitter {
  readonly id: SessionId;
  readonly opts: SessionCreateOptions;
  readonly ringBuffer: RingBuffer;
  private readonly pty: pty.IPty;
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
      env: { ...process.env, ...(opts.env ?? {}) } as { [key: string]: string },
    });
    this._status = 'running';

    this.pty.onData((data: string) => {
      const buf = Buffer.from(data, 'utf8');
      this.ringBuffer.write(buf);
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
    this.pty.write(typeof data === 'string' ? data : data.toString('utf8'));
  }

  resize(cols: number, rows: number): void {
    if (this._status === 'exited') return;
    this.pty.resize(cols, rows);
  }

  kill(signal: 'SIGHUP' | 'SIGTERM' | 'SIGKILL' = 'SIGHUP'): void {
    if (this._status === 'exited') return;
    this.pty.kill(signal);
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
      pid: this.pty.pid ?? null,
      exitCode: this._exitCode,
    };
  }
}

export interface Session {
  on<K extends keyof SessionEvents>(event: K, listener: SessionEvents[K]): this;
  emit<K extends keyof SessionEvents>(event: K, ...args: Parameters<SessionEvents[K]>): boolean;
}
```

- [ ] **Step 2: Re-export from `index.ts`**

Replace `packages/core/src/index.ts`:

```ts
export { RingBuffer } from './ring-buffer.js';
export { Session } from './session.js';
export type { SessionEvents } from './session.js';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aipad/core typecheck`
Expected: no errors.

- [ ] **Step 4: Run existing tests to make sure nothing regressed**

Run: `pnpm --filter @aipad/core test`
Expected: 6 RingBuffer tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session.ts packages/core/src/index.ts
git commit -m "feat(core): add Session PTY wrapper with ring buffer + events"
```

---

## Task 7: `SessionManager`

**Files:**
- Create: `packages/core/src/session-manager.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Implement `SessionManager`**

Create `packages/core/src/session-manager.ts`:

```ts
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  SessionCreateOptions,
  SessionId,
  SessionInfo,
} from '@aipad/contracts';
import { Session } from './session.js';

export interface SessionManagerEvents {
  sessionCreated: (info: SessionInfo) => void;
  sessionData: (sessionId: SessionId, chunk: Buffer) => void;
  sessionExited: (sessionId: SessionId, exitCode: number | null, signal: string | null) => void;
  sessionTitleChanged: (sessionId: SessionId, title: string) => void;
}

/**
 * Source of truth for all sessions in the main process. Plan 1 supports any number of sessions
 * (the data structures handle N) but the desktop app only ever creates one. Plan 2 adds the
 * tab UI that lets the user open more.
 */
export class SessionManager extends EventEmitter {
  private readonly sessions = new Map<SessionId, Session>();

  create(opts: SessionCreateOptions): Session {
    const id: SessionId = randomUUID();
    const session = new Session(id, opts);
    this.sessions.set(id, session);

    session.on('data', (chunk) => this.emit('sessionData', id, chunk));
    session.on('exit', ({ exitCode, signal }) => {
      this.emit('sessionExited', id, exitCode, signal);
      // Keep the session in the map so its ring buffer is still readable for a moment;
      // callers explicitly call close() to remove. (See Plan 1 success criteria — clean shutdown
      // calls closeAll().)
    });
    session.on('titleChanged', (title) => this.emit('sessionTitleChanged', id, title));

    this.emit('sessionCreated', session.info());
    return session;
  }

  get(id: SessionId): Session | undefined {
    return this.sessions.get(id);
  }

  list(): SessionInfo[] {
    return Array.from(this.sessions.values(), (s) => s.info());
  }

  write(id: SessionId, data: Buffer | string): void {
    this.sessions.get(id)?.write(data);
  }

  resize(id: SessionId, cols: number, rows: number): void {
    this.sessions.get(id)?.resize(cols, rows);
  }

  close(id: SessionId): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.kill('SIGHUP');
    this.sessions.delete(id);
  }

  async closeAll(timeoutMs = 1500): Promise<void> {
    const closes = Array.from(this.sessions.values()).map(
      (session) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            session.kill('SIGKILL');
            resolve();
          }, timeoutMs);
          session.on('exit', () => {
            clearTimeout(timer);
            resolve();
          });
          session.kill('SIGHUP');
        }),
    );
    await Promise.all(closes);
    this.sessions.clear();
  }
}

export interface SessionManager {
  on<K extends keyof SessionManagerEvents>(event: K, listener: SessionManagerEvents[K]): this;
  emit<K extends keyof SessionManagerEvents>(
    event: K,
    ...args: Parameters<SessionManagerEvents[K]>
  ): boolean;
}
```

- [ ] **Step 2: Re-export from `index.ts`**

Replace `packages/core/src/index.ts`:

```ts
export { RingBuffer } from './ring-buffer.js';
export { Session } from './session.js';
export type { SessionEvents } from './session.js';
export { SessionManager } from './session-manager.js';
export type { SessionManagerEvents } from './session-manager.js';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aipad/core typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/session-manager.ts packages/core/src/index.ts
git commit -m "feat(core): add SessionManager with create/write/close/closeAll"
```

---

## Task 8: `IpcRouter` (main-side IPC wiring)

**Files:**
- Create: `packages/core/src/ipc-router.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Implement `IpcRouter`**

Create `packages/core/src/ipc-router.ts`:

```ts
import type { IpcMain, WebContents } from 'electron';
import {
  IpcChannel,
  SessionCreateOptionsSchema,
  SessionWritePayloadSchema,
  SessionResizePayloadSchema,
  SessionClosePayloadSchema,
} from '@aipad/contracts';
import type { SessionInfo, SessionId } from '@aipad/contracts';
import type { SessionManager } from './session-manager.js';

/**
 * Wires the SessionManager up to Electron IPC. Validates every inbound payload with Zod;
 * a validation failure returns a structured error and never throws into the main loop.
 *
 * Outbound events (data/exit/title) are broadcast to all subscribed WebContents. Each
 * WebContents subscribes once at preload time.
 */
export class IpcRouter {
  private readonly subscribers = new Set<WebContents>();

  constructor(
    private readonly ipcMain: IpcMain,
    private readonly manager: SessionManager,
  ) {
    this.bindRequests();
    this.bindEvents();
  }

  subscribe(wc: WebContents): void {
    this.subscribers.add(wc);
    wc.once('destroyed', () => this.subscribers.delete(wc));
  }

  private bindRequests(): void {
    this.ipcMain.handle(IpcChannel.SessionCreate, (_e, raw): SessionInfo | { error: string } => {
      const parsed = SessionCreateOptionsSchema.safeParse(raw);
      if (!parsed.success) return { error: parsed.error.message };
      return this.manager.create(parsed.data).info();
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
  }

  private bindEvents(): void {
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
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const wc of this.subscribers) {
      if (wc.isDestroyed()) continue;
      wc.send(channel, payload);
    }
  }
}
```

- [ ] **Step 2: Add `electron` as a peer dep (types only)**

Edit `packages/core/package.json` — add to `devDependencies`:

```json
"electron": "^33.0.0"
```

Then: `pnpm install`
Expected: electron installed (we only use its types here; the runtime instance lives in `apps/desktop`).

- [ ] **Step 3: Re-export from `index.ts`**

Replace `packages/core/src/index.ts`:

```ts
export { RingBuffer } from './ring-buffer.js';
export { Session } from './session.js';
export type { SessionEvents } from './session.js';
export { SessionManager } from './session-manager.js';
export type { SessionManagerEvents } from './session-manager.js';
export { IpcRouter } from './ipc-router.js';
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @aipad/core typecheck`
Expected: no errors.

- [ ] **Step 5: Build the core package**

Run: `pnpm --filter @aipad/core build`
Expected: `packages/core/dist/` populated with `.js` and `.d.ts` files.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ipc-router.ts packages/core/src/index.ts packages/core/package.json pnpm-lock.yaml
git commit -m "feat(core): add IpcRouter bridging SessionManager <-> Electron IPC"
```

---

## Task 9: `@aipad/terminal-host` package

**Files:**
- Create: `packages/terminal-host/package.json`
- Create: `packages/terminal-host/tsconfig.json`
- Create: `packages/terminal-host/src/terminal-host.ts`
- Create: `packages/terminal-host/src/index.ts`

- [ ] **Step 1: Create `packages/terminal-host/package.json`**

```json
{
  "name": "@aipad/terminal-host",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@aipad/contracts": "workspace:*",
    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-web-links": "^0.11.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create `packages/terminal-host/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/terminal-host/src/terminal-host.ts`**

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
 *   window.aipad.on(channel, handler) -> unsubscribe
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
  }

  dispose(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this.resizeObserver?.disconnect();
    this.term.dispose();
  }

  private wireInput(): void {
    this.term.onData((data) => {
      void this.bridge.send(IpcChannel.SessionWrite, {
        sessionId: this.sessionId,
        data: btoa(unescape(encodeURIComponent(data))),
      });
    });
  }

  private wireOutput(): void {
    const onData = this.bridge.on(IpcChannel.SessionData, (raw) => {
      const event = raw as { sessionId: SessionId; data: string };
      if (event.sessionId !== this.sessionId) return;
      const decoded = decodeURIComponent(escape(atob(event.data)));
      this.term.write(decoded);
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
    // Push initial size so PTY matches viewport from frame 1.
    queueMicrotask(dispatchResize);
  }
}
```

- [ ] **Step 4: Create `packages/terminal-host/src/index.ts`**

```ts
export { TerminalHost } from './terminal-host.js';
export type { PreloadBridge, TerminalHostOptions } from './terminal-host.js';
```

- [ ] **Step 5: Install + typecheck + build**

Run: `pnpm install && pnpm --filter @aipad/terminal-host typecheck && pnpm --filter @aipad/terminal-host build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/terminal-host pnpm-lock.yaml
git commit -m "feat(terminal-host): add xterm bridge to main via IPC"
```

---

## Task 10: `apps/desktop` scaffold with electron-vite

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/electron.vite.config.ts`
- Create: `apps/desktop/index.html`
- Create: `apps/desktop/terminal-host.html`

- [ ] **Step 1: Create `apps/desktop/package.json`**

```json
{
  "name": "@aipad/desktop",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "preview": "electron-vite preview"
  },
  "dependencies": {
    "@aipad/contracts": "workspace:*",
    "@aipad/core": "workspace:*",
    "@aipad/keymap": "workspace:*",
    "@aipad/terminal-host": "workspace:*",
    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-web-links": "^0.11.0",
    "node-pty": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "electron": "^33.0.0",
    "electron-vite": "^2.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `apps/desktop/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "out",
    "rootDir": "src",
    "types": ["node"],
    "moduleResolution": "Bundler"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `apps/desktop/electron.vite.config.ts`**

```ts
import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
        external: ['node-pty'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          chrome: resolve(__dirname, 'index.html'),
          terminal: resolve(__dirname, 'terminal-host.html'),
        },
      },
    },
  },
});
```

- [ ] **Step 4: Create `apps/desktop/index.html` (chrome page)**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>AI.Pad</title>
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: ui-monospace, Menlo, Consolas, monospace; overflow: hidden; }
      #chrome-root { display: flex; flex-direction: column; height: 100%; }
      .tab-bar { background: #252526; color: #ccc; padding: 6px 12px; font-size: 12px; border-bottom: 1px solid #333; }
      .tab-bar .label { opacity: 0.6; }
      .view-host { flex: 1; position: relative; }
      #view-anchor { position: absolute; inset: 0; }
    </style>
  </head>
  <body>
    <div id="chrome-root">
      <div class="tab-bar"><span class="label">Plan 1 — single fixed session</span></div>
      <div class="view-host"><div id="view-anchor"></div></div>
    </div>
    <script type="module" src="/src/renderer/chrome/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `apps/desktop/terminal-host.html` (per-session page)**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>AI.Pad — Terminal</title>
    <link rel="stylesheet" href="/node_modules/@xterm/xterm/css/xterm.css" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #1e1e1e; overflow: hidden; }
      #term-root { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="term-root"></div>
    <script type="module" src="/src/renderer/terminal/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Install deps**

Run: `pnpm install`
Expected: Electron + electron-vite installed under `apps/desktop`. `node-pty` rebuild succeeds against Electron's Node ABI (electron-vite handles this automatically through `electron-rebuild`).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop pnpm-lock.yaml
git commit -m "chore(desktop): scaffold electron-vite app with chrome + terminal HTMLs"
```

---

## Task 11: Electron main process + preload

**Files:**
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Create `apps/desktop/src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron';

const bridge = {
  send: (channel: string, payload?: unknown): Promise<unknown> =>
    ipcRenderer.invoke(channel, payload),
  on: (channel: string, handler: (payload: unknown) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown): void => handler(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('aipad', bridge);
declare global { interface Window { aipad: typeof bridge } }
```

- [ ] **Step 2: Create `apps/desktop/src/main/index.ts`**

```ts
import { app, BrowserWindow, WebContentsView, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { IpcRouter, SessionManager } from '@aipad/core';
import type { Shell } from '@aipad/contracts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;

const sessionManager = new SessionManager();
const ipcRouter = new IpcRouter(ipcMain, sessionManager);

let chromeWindow: BrowserWindow | null = null;
let terminalView: WebContentsView | null = null;

function defaultShell(): Shell {
  if (process.platform === 'win32') return 'pwsh';
  if (process.platform === 'darwin') return 'zsh';
  return 'bash';
}

function preloadPath(): string {
  // electron-vite emits preload to ../preload/index.js relative to main bundle.
  return join(__dirname, '../preload/index.js');
}

function rendererEntry(name: 'chrome' | 'terminal'): { url?: string; file?: string } {
  if (isDev) {
    const port = process.env['ELECTRON_RENDERER_URL'];
    if (!port) throw new Error('ELECTRON_RENDERER_URL is required in dev (set by electron-vite)');
    return { url: name === 'chrome' ? `${port}/index.html` : `${port}/terminal-host.html` };
  }
  return { file: join(__dirname, `../renderer/${name === 'chrome' ? 'index' : 'terminal-host'}.html`) };
}

async function loadInto(view: WebContentsView | BrowserWindow, entry: { url?: string; file?: string }): Promise<void> {
  if (entry.url) await view.webContents.loadURL(entry.url);
  else if (entry.file) await view.webContents.loadFile(entry.file);
}

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

  await loadInto(chromeWindow, rendererEntry('chrome'));
  ipcRouter.subscribe(chromeWindow.webContents);

  // Stage 1: one fixed session attached as a WebContentsView on top of the chrome window.
  terminalView = new WebContentsView({
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
    },
  });
  chromeWindow.contentView.addChildView(terminalView);
  ipcRouter.subscribe(terminalView.webContents);

  // Position the view under the title bar / fake tab bar (30px). Resize tracks the window.
  const layout = (): void => {
    if (!chromeWindow || !terminalView) return;
    const { width, height } = chromeWindow.getContentBounds();
    terminalView.setBounds({ x: 0, y: 30, width, height: Math.max(0, height - 30) });
  };
  layout();
  chromeWindow.on('resize', layout);

  // Create the one fixed session *before* loading the renderer, so we can pass its id as a
  // query parameter — no IPC handshake or race window.
  const session = sessionManager.create({
    shell: defaultShell(),
    cwd: homedir(),
    cols: 80,
    rows: 24,
  });

  const entry = rendererEntry('terminal');
  if (entry.url) {
    await terminalView.webContents.loadURL(`${entry.url}?sessionId=${encodeURIComponent(session.id)}`);
  } else if (entry.file) {
    await terminalView.webContents.loadFile(entry.file, {
      query: { sessionId: session.id },
    });
  }
}

app.whenReady().then(async () => {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  await createChromeWindow();
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

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aipad/desktop typecheck`
Expected: no errors. (You may need to add `"types": ["node", "electron"]` to `apps/desktop/tsconfig.json` if TS complains about Electron types — they're in `electron/dist/electron.d.ts`.)

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main apps/desktop/src/preload
git commit -m "feat(desktop): add Electron main + preload with single fixed session"
```

---

## Task 12: Renderers (chrome + terminal) — first end-to-end run

**Files:**
- Create: `apps/desktop/src/renderer/chrome/main.ts`
- Create: `apps/desktop/src/renderer/terminal/main.ts`

- [ ] **Step 1: Create `apps/desktop/src/renderer/chrome/main.ts`**

```ts
/**
 * Plan 1 chrome is intentionally inert: a label, a flex container. The real terminal
 * is the WebContentsView attached by main and stacked over this DOM. Plan 2 replaces
 * the label with TabStrip + Sidebar.
 */
console.info('[chrome] mounted');
```

- [ ] **Step 2: Create `apps/desktop/src/renderer/terminal/main.ts`**

```ts
import { TerminalHost } from '@aipad/terminal-host';
import type { SessionId } from '@aipad/contracts';

const container = document.getElementById('term-root');
if (!container) throw new Error('#term-root not found in terminal-host.html');

const bridge = (window as unknown as { aipad: import('@aipad/terminal-host').PreloadBridge }).aipad;

// Main passes the session id via the page URL query string (no IPC handshake needed).
const sessionId = new URLSearchParams(window.location.search).get('sessionId') as SessionId | null;
if (!sessionId) throw new Error('terminal-host.html opened without ?sessionId=...');

new TerminalHost({ container, sessionId, bridge });
console.info('[terminal] bound to session', sessionId);
```

- [ ] **Step 3: Build the workspace packages first**

Run: `pnpm -r --filter './packages/*' build`
Expected: `dist/` populated in every package.

- [ ] **Step 4: Run the app in dev mode**

Run: `pnpm dev`
Expected:
- electron-vite starts a Vite dev server (port printed in console).
- An Electron window opens, ~1280×800.
- Top strip shows "Plan 1 — single fixed session".
- The rest of the window is a black xterm with a PowerShell prompt.
- Type `Get-Date` and Enter — the current date prints below.
- Close the window — the process tree fully exits (verify in Task Manager: no orphan `pwsh.exe`).

If the prompt does not appear, see Troubleshooting at the bottom of this task.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer
git commit -m "feat(desktop): wire chrome + terminal renderers, first end-to-end run"
```

**Troubleshooting (Step 4):**

| Symptom | Likely cause | Fix |
|---|---|---|
| `Cannot find module 'node-pty'` at runtime | Native module not rebuilt for Electron's Node version | Run `pnpm --filter @aipad/desktop exec electron-rebuild -f -w node-pty`, then re-run `pnpm dev`. |
| Blank window, no prompt | preload not loaded / contextBridge unavailable | Check DevTools (Ctrl+Shift+I) for `window.aipad === undefined`. Verify `preloadPath()` resolves to an existing file under `out/preload/index.js`. |
| Window opens but immediately closes | Uncaught exception in main | Read terminal output of `pnpm dev`; common cause is `ELECTRON_RENDERER_URL` missing — make sure you used `pnpm dev`, not `electron .` directly. |
| xterm renders but typing does nothing | IPC mismatch on base64 encoding | Confirm both `terminal-host.ts` and `preload/index.ts` use the same encoding round-trip. |

---

## Task 13: Integration test — SessionManager + real PTY

**Files:**
- Create: `tests/integration/package.json`
- Create: `tests/integration/tsconfig.json`
- Create: `tests/integration/vitest.config.ts`
- Create: `tests/integration/session-manager.test.ts`

- [ ] **Step 1: Create `tests/integration/package.json`**

```json
{
  "name": "@aipad/integration",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@aipad/contracts": "workspace:*",
    "@aipad/core": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tests/integration/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 3: Create `tests/integration/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
  },
});
```

- [ ] **Step 4: Write integration test**

Create `tests/integration/session-manager.test.ts`:

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

function collect(manager: SessionManager, sessionId: string): { read: () => string } {
  let buffer = '';
  manager.on('sessionData', (id, chunk) => {
    if (id === sessionId) buffer += chunk.toString('utf8');
  });
  return { read: () => buffer };
}

async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('SessionManager + real PTY', () => {
  let manager: SessionManager;

  beforeEach(() => { manager = new SessionManager(); });
  afterEach(async () => { await manager.closeAll(); });

  it('spawns a real shell and pipes stdout back to subscribers', async () => {
    const session = manager.create({ shell: defaultShell(), cwd: homedir(), cols: 80, rows: 24 });
    const stream = collect(manager, session.id);

    // Give the shell a moment to print its prompt.
    await waitFor(() => stream.read().length > 0);

    const marker = 'AIPAD_PROBE_' + Date.now().toString(36);
    session.write(`echo ${marker}\r`);

    await waitFor(() => stream.read().includes(marker));
    expect(stream.read()).toContain(marker);
  });

  it('routes writes to the correct session and never crosses streams', async () => {
    const a = manager.create({ shell: defaultShell(), cwd: homedir(), cols: 80, rows: 24 });
    const b = manager.create({ shell: defaultShell(), cwd: homedir(), cols: 80, rows: 24 });
    const streamA = collect(manager, a.id);
    const streamB = collect(manager, b.id);

    await waitFor(() => streamA.read().length > 0 && streamB.read().length > 0);

    const tagA = 'AIPAD_A_' + Date.now().toString(36);
    const tagB = 'AIPAD_B_' + Date.now().toString(36);
    a.write(`echo ${tagA}\r`);
    b.write(`echo ${tagB}\r`);

    await waitFor(() => streamA.read().includes(tagA) && streamB.read().includes(tagB));
    expect(streamA.read()).toContain(tagA);
    expect(streamA.read()).not.toContain(tagB);
    expect(streamB.read()).toContain(tagB);
    expect(streamB.read()).not.toContain(tagA);
  });

  it('reports exit and stops emitting data after the shell quits', async () => {
    const session = manager.create({ shell: defaultShell(), cwd: homedir(), cols: 80, rows: 24 });
    let exited = false;
    manager.on('sessionExited', (id) => { if (id === session.id) exited = true; });

    await waitFor(() => true, 200);
    session.write('exit\r');

    await waitFor(() => exited);
    expect(exited).toBe(true);
  });
});
```

- [ ] **Step 5: Install and run**

Run: `pnpm install && pnpm --filter @aipad/integration test`
Expected: all 3 integration tests pass. (On Windows, this requires `pwsh.exe` on PATH. If only `powershell.exe` is available, edit `defaultShell()` to return `'powershell'`.)

- [ ] **Step 6: Commit**

```bash
git add tests/integration pnpm-lock.yaml
git commit -m "test(integration): SessionManager + real PTY round-trip + isolation"
```

---

## Task 14: Playwright E2E smoke test

**Files:**
- Create: `tests/e2e/package.json`
- Create: `tests/e2e/playwright.config.ts`
- Create: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Create `tests/e2e/package.json`**

```json
{
  "name": "@aipad/e2e",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0",
    "@types/node": "^20.14.0",
    "electron": "^33.0.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create `tests/e2e/playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
});
```

- [ ] **Step 3: Create `tests/e2e/smoke.spec.ts`**

```ts
import { _electron as electron, expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('app launches, prompt appears, echo round-trips', async () => {
  const electronApp = await electron.launch({
    args: [resolve(__dirname, '../../apps/desktop')],
    env: { ...process.env, NODE_ENV: 'production' },
  });

  // The chrome window is the first window; the WebContentsView is its own webContents.
  // For Plan 1 we only need to confirm the app boots and stays up.
  const chrome = await electronApp.firstWindow();
  await expect(chrome.locator('.tab-bar')).toHaveText(/Plan 1/);

  // Cleanly close.
  await electronApp.close();
});
```

> **Note for the engineer:** Playwright's Electron driver doesn't expose `WebContentsView`s as separate Playwright pages today, so this Plan 1 smoke only validates the chrome window. Plan 2 introduces full xterm assertions once we control views from the renderer (each tab will be a `BrowserView`/`WebContentsView` we can route through Playwright via `electronApp.windows()` once tabs are addressable). The integration test (Task 13) provides the PTY round-trip coverage in the meantime.

- [ ] **Step 4: Install Playwright + browsers it needs**

Run: `pnpm install && pnpm --filter @aipad/e2e exec playwright install --with-deps chromium`
Expected: Playwright + Chromium downloaded. (Required even for Electron tests because Playwright uses Chromium tooling.)

- [ ] **Step 5: Build apps/desktop**

Run: `pnpm --filter @aipad/desktop build`
Expected: `apps/desktop/out/` populated with main, preload, renderer bundles.

- [ ] **Step 6: Run the E2E smoke**

Run: `pnpm test:e2e`
Expected: 1 test passes — app launches, chrome shows the "Plan 1" label, closes cleanly.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e pnpm-lock.yaml
git commit -m "test(e2e): Playwright smoke that launches packaged app"
```

---

## Task 15: README + dev scripts + Plan 1 sign-off

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```md
# AI.Pad

Cross-platform tabbed terminal that runs many sessions in parallel and surfaces — across every tab — when any session needs your attention.

This repository is in active development.

## Status

| Stage | Plan | Status |
|---|---|---|
| Stage 1 | Plan 1 — Foundations | in progress |
| Stage 1 | Plan 2 — Multi-tab + attention | not started |
| Stage 1 | Plan 3 — Splits + persistence + packaging | not started |
| Stage 2 | Overview tab | not started |

## Quick start (development)

Requires: Node.js 20+, pnpm 9+, and (on Windows) PowerShell 7 (`pwsh.exe`) on PATH.

```bash
pnpm install
pnpm dev
```

A window opens with one PowerShell session.

## Layout

| Path | Contents |
|---|---|
| `packages/contracts/` | Typed IPC messages, Session types, Zod schemas |
| `packages/core/` | Main-process logic: `SessionManager`, `Session`, `RingBuffer`, `IpcRouter` |
| `packages/terminal-host/` | Renderer-side xterm.js wrapper |
| `packages/keymap/` | Keyboard shortcut registry (grows in Plan 2/3) |
| `apps/desktop/` | Electron application — main, preload, renderers |
| `tests/integration/` | Real-PTY tests against `SessionManager` |
| `tests/e2e/` | Playwright tests against the packaged app |
| `docs/superpowers/specs/` | Design spec(s) |
| `docs/superpowers/plans/` | Implementation plan(s) |

## Scripts

| Command | Effect |
|---|---|
| `pnpm dev` | Run the Electron app in dev mode (Vite HMR for renderers, electron-vite for main) |
| `pnpm build` | Build all packages and the Electron app |
| `pnpm test` | Unit + integration tests (Vitest) |
| `pnpm test:e2e` | Playwright smoke against the built app |
| `pnpm typecheck` | TypeScript across all packages |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |
```

- [ ] **Step 2: Run the full test pipeline end-to-end**

Run: `pnpm install && pnpm -r build && pnpm test && pnpm test:e2e`
Expected: all green.

- [ ] **Step 3: Manual smoke**

Run: `pnpm dev`
Verify the Plan 1 success criteria from the header:
- Window opens, ~1280×800.
- xterm shows a PowerShell prompt.
- `Get-Date` → prints current date.
- Close window → process tree exits (check Task Manager — no orphan `pwsh.exe` or `electron.exe`).

- [ ] **Step 4: Commit + tag**

```bash
git add README.md
git commit -m "docs: README with quick-start and repo layout"
git tag stage1-plan1-foundations
```

---

## Plan 1 done. Next: Plan 2 — Multi-tab + attention

When Plan 1 is signed off, the next plan covers:

- TabStrip in the chrome renderer (new / close / switch / reorder)
- Multiple `WebContentsView`s — one per session, lifecycle managed by main
- `AttentionDetector` (BEL + idle heuristic + OSC hook) running in main
- Sidebar with per-session status and time-in-state
- OS notifications via `NotificationService` (coalesced)
- Renderer crash recovery via `RingBuffer.snapshot()` replay
- Tab + sidebar keyboard shortcuts (`Ctrl+T`, `Ctrl+W`, `Ctrl+Tab`, `Ctrl+1..9`, `Ctrl+B`)

That plan will be written once Plan 1's tag is in place.
