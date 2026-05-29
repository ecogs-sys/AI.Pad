import { afterEach, describe, expect, it } from 'vitest';
import { homedir, platform } from 'node:os';
import { Session } from '../src/session.js';
import type { AttentionEvent, Shell } from '@aipad/contracts';

function defaultShell(): Shell {
  if (platform() === 'win32') return 'pwsh';
  if (platform() === 'darwin') return 'zsh';
  return 'bash';
}

function newSession(): Session {
  return new Session('s1', { shell: defaultShell(), cwd: homedir(), cols: 80, rows: 24 });
}

describe('Session attention gate', () => {
  let session: Session | null = null;
  afterEach(() => { session?.kill(); session = null; });

  it('does not emit idle attention before any user input', async () => {
    session = newSession();
    const events: AttentionEvent[] = [];
    session.on('attention', (ev) => events.push(ev));

    // Wait well past the 1.5 s idle window — the shell has printed its prompt
    // and gone quiet, which today would emit idle.
    await new Promise((r) => setTimeout(r, 2500));

    expect(events.filter((e) => e.signal === 'idle')).toHaveLength(0);
  });
});
