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

  close(id: SessionId, timeoutMs = 1500): void {
    const session = this.sessions.get(id);
    if (!session) return;

    // Short-circuit if already exited: remove from map immediately.
    if (session.info().status === 'exited') {
      this.sessions.delete(id);
      return;
    }

    const timer = setTimeout(() => {
      session.kill('SIGKILL');
      this.sessions.delete(id);
    }, timeoutMs);
    session.once('exit', () => {
      clearTimeout(timer);
      this.sessions.delete(id);
    });
    session.kill('SIGHUP');
  }

  async closeAll(timeoutMs = 1500): Promise<void> {
    const closes = Array.from(this.sessions.values()).map(
      (session) =>
        new Promise<void>((resolve) => {
          if (session.info().status === 'exited') {
            resolve();
            return;
          }
          const timer = setTimeout(() => {
            session.kill('SIGKILL');
            resolve();
          }, timeoutMs);
          session.once('exit', () => {
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
