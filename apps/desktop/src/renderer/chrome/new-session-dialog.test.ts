// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showNewSessionDialog } from './new-session-dialog.js';

interface FakeBridge {
  send: ReturnType<typeof vi.fn>;
}

function mountEl(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'dialog-mount';
  document.body.appendChild(el);
  return el;
}

function freshBridge(): FakeBridge {
  const send = vi.fn();
  (window as unknown as { aipad: FakeBridge }).aipad = { send };
  return { send };
}

function setUserAgent(ua: string): void {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

beforeEach(() => {
  document.body.innerHTML = '';
  freshBridge();
  setUserAgent('Windows NT 10.0; Win64; x64');
});

describe('showNewSessionDialog — structure', () => {
  it('mounts an .aip-modal--newsession with header crumb and Start button', () => {
    const mount = mountEl();
    void showNewSessionDialog(mount, { defaultShell: 'pwsh', defaultCwd: 'C:\\Users\\me\\proj' });

    const root = mount.querySelector('.aip-modal--newsession');
    expect(root).not.toBeNull();

    const crumb = root!.querySelector('.aip-modal__crumb');
    const title = root!.querySelector('.aip-modal__title');
    expect(crumb?.textContent).toBe('New session');
    expect(title?.textContent).toBe('Configure');

    const start = root!.querySelector('.aip-btn--primary');
    expect(start?.textContent).toContain('Start session');
  });
});
