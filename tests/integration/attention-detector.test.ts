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

    // Sync on real shell output rather than wall-clock delays — startup timing
    // varies enough on hosted CI to spill banner output past any fixed flush
    // window and into the assertion buffer.
    let stdoutBuf = '';
    session.on('data', (buf: Buffer) => { stdoutBuf += buf.toString('utf8'); });

    // Phase 1 — drain startup. Wait for our marker to round-trip; that
    // proves the prompt has finished printing the banner.
    const drainMarker = `__AIPAD_DRAIN_${Date.now()}__`;
    session.write(`echo ${drainMarker}\r`);
    await waitFor(() => stdoutBuf.includes(drainMarker));
    events.length = 0;

    // Phase 2 — write the actual ordinary-output command and wait for its
    // echo to land. After this, the only thing that could surface in events
    // is a detector signal mistakenly attributed to ordinary stdout.
    const echoMarker = `hello_${Date.now()}`;
    stdoutBuf = '';
    session.write(`echo ${echoMarker}\r`);
    await waitFor(() => stdoutBuf.includes(echoMarker));

    // Small tail to let any prompt-redraw bytes flow through the detectors
    // — this is the window where a stray signal would actually appear.
    await new Promise((r) => setTimeout(r, 200));

    expect(events).toHaveLength(0);
  });
});
