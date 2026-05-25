import { describe, expect, it, vi } from 'vitest';

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    onData: () => ({ dispose: () => {} }),
    onExit: () => ({ dispose: () => {} }),
    write: () => {},
    resize: () => {},
    kill: () => {},
    pid: 0,
  })),
}));

import { spawn } from 'node-pty';
import { Session } from '../src/session.js';

describe('Session shell command resolution', () => {
  it('resolves git-bash to bash.exe', () => {
    new Session('id', { shell: 'git-bash', cwd: '.', cols: 80, rows: 24 });
    expect((spawn as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toBe('bash.exe');
  });

  it('still resolves pwsh to pwsh.exe', () => {
    new Session('id', { shell: 'pwsh', cwd: '.', cols: 80, rows: 24 });
    expect((spawn as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toBe('pwsh.exe');
  });
});
