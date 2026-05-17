import { TerminalHost } from '@aipad/terminal-host';
import type { SessionId } from '@aipad/contracts';

const container = document.getElementById('term-root');
if (!container) throw new Error('#term-root not found in terminal-host.html');

const bridge = (window as unknown as { aipad: import('@aipad/terminal-host').PreloadBridge }).aipad;

// Main passes the session id via the page URL query string (no IPC handshake needed).
const sessionId = new URLSearchParams(window.location.search).get('sessionId') as SessionId | null;
if (!sessionId) throw new Error('terminal-host.html opened without ?sessionId=...');

new TerminalHost({ container, sessionId, bridge });
console.info('[terminal] bound to session', sessionId);
