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

describe('showNewSessionDialog — working directory', () => {
  it('renders the path with parent muted and tail bright (POSIX)', async () => {
    const mount = mountEl();
    void showNewSessionDialog(mount, { defaultShell: 'bash', defaultCwd: '/home/me/work/foo' });

    // First mount starts in edit state and auto-focuses the input. Blur it to enter display state.
    const input = mount.querySelector<HTMLInputElement>('.aip-path-input__field input');
    expect(input).not.toBeNull();
    input!.blur();

    const dim = mount.querySelector('.aip-path-input__field .dim');
    expect(dim?.textContent).toBe('/home/me/work/');
    const fieldText = mount.querySelector('.aip-path-input__field')!.textContent;
    expect(fieldText).toContain('foo');
  });

  it('renders the path with parent muted and tail bright (Windows)', () => {
    const mount = mountEl();
    void showNewSessionDialog(mount, { defaultShell: 'pwsh', defaultCwd: 'C:\\Users\\me\\proj' });
    const input = mount.querySelector<HTMLInputElement>('.aip-path-input__field input')!;
    input.blur();
    const dim = mount.querySelector('.aip-path-input__field .dim');
    expect(dim?.textContent).toBe('C:\\Users\\me\\');
    expect(mount.querySelector('.aip-path-input__field')!.textContent).toContain('proj');
  });

  it('starts in edit state with the input focused and selected', () => {
    const mount = mountEl();
    void showNewSessionDialog(mount, { defaultShell: 'bash', defaultCwd: '/foo' });
    const input = mount.querySelector<HTMLInputElement>('.aip-path-input__field input');
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(input!.selectionStart).toBe(0);
    expect(input!.selectionEnd).toBe('/foo'.length);
  });

  it('clicking the display state swaps to edit state and focuses the input', () => {
    const mount = mountEl();
    void showNewSessionDialog(mount, { defaultShell: 'bash', defaultCwd: '/foo' });
    const input = mount.querySelector<HTMLInputElement>('.aip-path-input__field input')!;
    input.blur(); // enter display state

    const field = mount.querySelector<HTMLDivElement>('.aip-path-input__field')!;
    field.click();

    const newInput = mount.querySelector<HTMLInputElement>('.aip-path-input__field input');
    expect(newInput).not.toBeNull();
    expect(document.activeElement).toBe(newInput);
  });
});

describe('showNewSessionDialog — Browse button', () => {
  it('dispatches FsPickDirectory with the current cwd and updates the field on success', async () => {
    const mount = mountEl();
    const bridge = (window as unknown as { aipad: FakeBridge }).aipad;
    bridge.send.mockResolvedValueOnce({ path: '/picked/dir' });

    void showNewSessionDialog(mount, { defaultShell: 'bash', defaultCwd: '/start' });
    const browse = mount.querySelector<HTMLButtonElement>('.aip-path-input__browse')!;
    browse.click();

    // Wait for the async update.
    await new Promise((r) => setTimeout(r, 0));

    expect(bridge.send).toHaveBeenCalledWith('core.fs.pick-directory', { startPath: '/start' });
    const input = mount.querySelector<HTMLInputElement>('.aip-path-input__field input')!;
    expect(input.value).toBe('/picked/dir');
  });

  it('leaves the field unchanged when the user cancels', async () => {
    const mount = mountEl();
    const bridge = (window as unknown as { aipad: FakeBridge }).aipad;
    bridge.send.mockResolvedValueOnce({ cancelled: true });

    void showNewSessionDialog(mount, { defaultShell: 'bash', defaultCwd: '/start' });
    mount.querySelector<HTMLButtonElement>('.aip-path-input__browse')!.click();
    await new Promise((r) => setTimeout(r, 0));

    const input = mount.querySelector<HTMLInputElement>('.aip-path-input__field input')!;
    expect(input.value).toBe('/start');
  });
});

describe('showNewSessionDialog — shell radio row', () => {
  it('shows pwsh.exe / cmd.exe / git-bash on Windows', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    const mount = mountEl();
    void showNewSessionDialog(mount, { defaultShell: 'pwsh', defaultCwd: '/x' });
    const labels = [...mount.querySelectorAll('.aip-radio')].map((r) => r.textContent!.trim());
    expect(labels).toEqual(['pwsh.exe', 'cmd.exe', 'git-bash']);
  });

  it('shows zsh / bash on macOS', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    const mount = mountEl();
    void showNewSessionDialog(mount, { defaultShell: 'zsh', defaultCwd: '/x' });
    const labels = [...mount.querySelectorAll('.aip-radio')].map((r) => r.textContent!.trim());
    expect(labels).toEqual(['zsh', 'bash']);
  });

  it('shows bash / zsh on Linux', () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64)');
    const mount = mountEl();
    void showNewSessionDialog(mount, { defaultShell: 'bash', defaultCwd: '/x' });
    const labels = [...mount.querySelectorAll('.aip-radio')].map((r) => r.textContent!.trim());
    expect(labels).toEqual(['bash', 'zsh']);
  });

  it('marks the default shell active', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    const mount = mountEl();
    void showNewSessionDialog(mount, { defaultShell: 'cmd', defaultCwd: '/x' });
    const active = mount.querySelector('.aip-radio--active');
    expect(active?.textContent).toContain('cmd.exe');
  });

  it('switches active on click', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    const mount = mountEl();
    void showNewSessionDialog(mount, { defaultShell: 'pwsh', defaultCwd: '/x' });
    const radios = mount.querySelectorAll<HTMLElement>('.aip-radio');
    radios[2]!.click();   // git-bash
    expect(radios[0]!.classList.contains('aip-radio--active')).toBe(false);
    expect(radios[2]!.classList.contains('aip-radio--active')).toBe(true);
  });

  it('ArrowRight moves selection forward', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    const mount = mountEl();
    void showNewSessionDialog(mount, { defaultShell: 'pwsh', defaultCwd: '/x' });
    const radios = mount.querySelectorAll<HTMLElement>('.aip-radio');
    radios[0]!.focus();
    radios[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(radios[1]!.classList.contains('aip-radio--active')).toBe(true);
    expect(document.activeElement).toBe(radios[1]);
  });

  it('ArrowLeft from first wraps to last', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    const mount = mountEl();
    void showNewSessionDialog(mount, { defaultShell: 'pwsh', defaultCwd: '/x' });
    const radios = mount.querySelectorAll<HTMLElement>('.aip-radio');
    radios[0]!.focus();
    radios[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(radios[radios.length - 1]!.classList.contains('aip-radio--active')).toBe(true);
  });
});
