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

  it('emits idle attention after the first user input', async () => {
    session = newSession();
    const events: AttentionEvent[] = [];
    session.on('attention', (ev) => events.push(ev));

    // Let the startup prompt drain past the idle window with the gate in place
    // (no idle should fire yet — that is verified by the previous test).
    await new Promise((r) => setTimeout(r, 2000));
    expect(events.filter((e) => e.signal === 'idle')).toHaveLength(0);

    // Send an empty newline so the shell prints a fresh prompt without running
    // a command. After idle elapses again, idle attention should now fire.
    const before = events.length;
    session.write('\r');

    await new Promise((r) => setTimeout(r, 2500));

    const idleAfterInput = events
      .slice(before)
      .filter((e) => e.signal === 'idle');
    expect(idleAfterInput.length).toBeGreaterThan(0);
  });

  it("does not change status to 'awaiting-input' on a suppressed idle (quiet shell)", async () => {
    session = newSession();
    const events: AttentionEvent[] = [];
    session.on('attention', (ev) => events.push(ev));

    await new Promise((r) => setTimeout(r, 2500));

    // Primary invariant: idle is suppressed pre-input. Already covered by the
    // first test; re-asserted here so a regression that re-emits idle would
    // also fail this test instead of vacuously passing.
    expect(events.filter((e) => e.signal === 'idle')).toHaveLength(0);

    // Secondary invariant: a suppressed idle must NOT mutate _status. That is
    // only observable when nothing else moved status during the wait window.
    // pwsh on Windows emits a BEL in its banner, which legitimately drives
    // status to 'awaiting-input' (bell is unsuppressed by design). When the
    // shell is quiet, the gate is the only thing that could have flipped
    // status — so assert only in that case.
    if (events.length === 0) {
      expect(session.info().status).toBe('running');
    }
  });
});
