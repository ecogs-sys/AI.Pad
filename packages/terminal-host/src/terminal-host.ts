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
  }

  dispose(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this.resizeObserver?.disconnect();
    this.term.dispose();
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
    // Push initial size so PTY matches viewport from frame 1.
    queueMicrotask(dispatchResize);
  }
}
