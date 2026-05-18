import { EventEmitter } from 'node:events';
import * as pty from 'node-pty';
import type {
  AttentionEvent,
  SessionCreateOptions,
  SessionId,
  SessionInfo,
  SessionStatus,
} from '@aipad/contracts';
import { AttentionDetector } from './attention-detector.js';
import { RingBuffer } from './ring-buffer.js';

export interface SessionEvents {
  data: (chunk: Buffer) => void;
  exit: (info: { exitCode: number | null; signal: string | null }) => void;
  titleChanged: (title: string) => void;
  attention: (ev: AttentionEvent) => void;
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
