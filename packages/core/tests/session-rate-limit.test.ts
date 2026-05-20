import { afterEach, describe, expect, it } from 'vitest';
import { homedir, platform } from 'node:os';
import { Session } from '../src/session.js';
import type { Shell } from '@aipad/contracts';

function defaultShell(): Shell {
  if (platform() === 'win32') return 'pwsh';
  if (platform() === 'darwin') return 'zsh';
  return 'bash';
}

describe('Session rate-limit detection', () => {
  let session: Session | null = null;
  afterEach(() => { session?.kill(); session = null; });

  it('re-emits rateLimitDetected when the configured phrase is set and seen', async () => {
    session = new Session('s1', { shell: defaultShell(), cwd: homedir(), cols: 80, rows: 24 });
    session.setRateLimitDetectText('AIPAD-LIMIT-MARKER');
    const seen: string[] = [];
    session.on('rateLimitDetected', (resetText) => seen.push(resetText));

    await new Promise((r) => setTimeout(r, 400)); // flush startup noise
    session.write('echo AIPAD-LIMIT-MARKER resets 9:30pm\r');

    await new Promise((r) => setTimeout(r, 1500));
    expect(seen.some((t) => t.includes('AIPAD-LIMIT-MARKER'))).toBe(true);
  });
});
