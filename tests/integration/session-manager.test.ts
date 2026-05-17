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
