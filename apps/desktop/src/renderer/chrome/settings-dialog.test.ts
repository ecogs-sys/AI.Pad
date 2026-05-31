// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showSettingsDialog } from './settings-dialog.js';
import type { AppSettings } from '@aipad/contracts';
import { IpcChannel } from '@aipad/contracts';

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
  const send = vi.fn().mockResolvedValue({ ok: true });
  (window as unknown as { aipad: FakeBridge }).aipad = { send };
  return { send };
}

const BASE: AppSettings = {
  autoResume: { enabled: true, detectText: "You've hit your limit", responseText: 'continue' },
  defaultCwd: '',
};

beforeEach(() => {
  document.body.innerHTML = '';
  freshBridge();
});

describe('showSettingsDialog — Default Working Directory section', () => {
  it('renders a "DEFAULT WORKING DIRECTORY" label', () => {
    const mount = mountEl();
    void showSettingsDialog(mount, BASE);

    const labels = [...mount.querySelectorAll('.dlg-label')].map((l) => l.textContent);
    expect(labels).toContain('DEFAULT WORKING DIRECTORY');
  });

  it('pre-fills the path input with current.defaultCwd', () => {
    const mount = mountEl();
    void showSettingsDialog(mount, { ...BASE, defaultCwd: '/home/me/projects' });

    const input = mount.querySelector<HTMLInputElement>('#set-default-cwd');
    expect(input?.value).toBe('/home/me/projects');
  });

  it('pre-fills empty string when defaultCwd is not set', () => {
    const mount = mountEl();
    void showSettingsDialog(mount, { ...BASE, defaultCwd: '' });

    const input = mount.querySelector<HTMLInputElement>('#set-default-cwd');
    expect(input?.value).toBe('');
  });

  it('renders a Browse button', () => {
    const mount = mountEl();
    void showSettingsDialog(mount, BASE);

    const browseBtn = mount.querySelector<HTMLButtonElement>('#set-default-cwd-browse');
    expect(browseBtn).not.toBeNull();
    expect(browseBtn!.textContent).toContain('Browse');
  });

  it('Browse button calls FsPickDirectory and updates the input when a path is returned', async () => {
    const bridge = freshBridge();
    bridge.send.mockImplementation((channel: string) => {
      if (channel === IpcChannel.FsPickDirectory) return Promise.resolve({ path: '/new/path' });
      return Promise.resolve({ ok: true });
    });
    const mount = mountEl();
    void showSettingsDialog(mount, BASE);

    mount.querySelector<HTMLButtonElement>('#set-default-cwd-browse')!.click();
    await new Promise((r) => setTimeout(r, 0));

    const input = mount.querySelector<HTMLInputElement>('#set-default-cwd');
    expect(input?.value).toBe('/new/path');
  });

  it('Browse returning cancelled leaves the input unchanged', async () => {
    const bridge = freshBridge();
    bridge.send.mockImplementation((channel: string) => {
      if (channel === IpcChannel.FsPickDirectory) return Promise.resolve({ cancelled: true });
      return Promise.resolve({ ok: true });
    });
    const mount = mountEl();
    void showSettingsDialog(mount, { ...BASE, defaultCwd: '/original' });

    mount.querySelector<HTMLButtonElement>('#set-default-cwd-browse')!.click();
    await new Promise((r) => setTimeout(r, 0));

    const input = mount.querySelector<HTMLInputElement>('#set-default-cwd');
    expect(input?.value).toBe('/original');
  });

  it('Save resolves with the trimmed defaultCwd value', async () => {
    const mount = mountEl();
    const p = showSettingsDialog(mount, BASE);

    const input = mount.querySelector<HTMLInputElement>('#set-default-cwd')!;
    input.value = '  /my/path  ';

    mount.querySelector<HTMLButtonElement>('#set-save')!.click();
    const result = await p;
    expect(result?.defaultCwd).toBe('/my/path');
  });

  it('Save with empty defaultCwd resolves successfully — empty is valid', async () => {
    const mount = mountEl();
    const p = showSettingsDialog(mount, BASE);

    mount.querySelector<HTMLButtonElement>('#set-save')!.click();
    const result = await p;
    expect(result).not.toBeNull();
    expect(result?.defaultCwd).toBe('');
  });

  it('Save returns autoResume settings alongside the new defaultCwd', async () => {
    const mount = mountEl();
    const current: AppSettings = {
      autoResume: { enabled: false, detectText: 'limit reached', responseText: 'go' },
      defaultCwd: '/existing',
    };
    const p = showSettingsDialog(mount, current);

    mount.querySelector<HTMLButtonElement>('#set-save')!.click();
    const result = await p;
    expect(result?.autoResume.enabled).toBe(false);
    expect(result?.autoResume.detectText).toBe('limit reached');
    expect(result?.defaultCwd).toBe('/existing');
  });
});
