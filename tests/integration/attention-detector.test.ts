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

    // Wait long enough for ALL bash/pwsh startup output (including any BEL bytes)
    // to have been fully flushed through the PTY before we open the attention gate.
    // 400 ms is not enough on loaded CI runners where startup chunks arrive late.
    await new Promise((r) => setTimeout(r, 1000));

    // Clear any events from startup before the test command.
    events.length = 0;

    session.write(`echo hello\r`);
    // Stay well below the 1.5 s idle window (800 ms margin) so idle can't fire.
    await new Promise((r) => setTimeout(r, 700));

    // Ordinary text output must not ring a bell or emit an OSC escape.
    // Idle attention is expected behavior once the quiet window elapses — don't
    // assert on it here since its timing is environment-dependent.
    const unexpected = events.filter((e) => e.signal !== 'idle');
    expect(unexpected).toHaveLength(0);
  });
});
