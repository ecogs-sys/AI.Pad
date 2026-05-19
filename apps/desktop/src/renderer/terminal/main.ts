import type { PreloadBridge } from '@aipad/terminal-host';
import type { SessionId, Shell } from '@aipad/contracts';
import { IpcChannel } from '@aipad/contracts';
import { SplitContainer } from './split-container.js';

const container = document.getElementById('term-root');
if (!container) throw new Error('#term-root not found in terminal-host.html');

const bridge = (window as unknown as { aipad: PreloadBridge }).aipad;

const params = new URLSearchParams(window.location.search);
const sessionId = params.get('sessionId') as SessionId | null;
const shell = (params.get('shell') ?? 'pwsh') as Shell;
const cwd = params.get('cwd') ?? '~';
if (!sessionId) throw new Error('terminal-host.html opened without ?sessionId=...');

const splits = new SplitContainer({
  rootEl: container,
  bridge,
  initialSessionId: sessionId,
  shell,
  cwd,
});

// Expose for keyboard / split shortcuts.
(window as unknown as { __aipadSplits: SplitContainer }).__aipadSplits = splits;

bridge.on(IpcChannel.TerminalAction, (raw) => {
  const e = raw as { action: 'splitHorizontal' | 'splitVertical' };
  if (e.action === 'splitHorizontal') void splits.splitFocused('horizontal');
  else if (e.action === 'splitVertical') void splits.splitFocused('vertical');
});

console.info('[terminal] split container mounted; primary session', sessionId);
