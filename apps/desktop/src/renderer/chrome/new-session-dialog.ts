import type { Shell } from '@aipad/contracts';

export interface NewSessionResult {
  shell: Shell;
  cwd: string;
}

export interface NewSessionDialogOptions {
  defaultShell: Shell;
  defaultCwd: string;
}

/**
 * Show a modal dialog and resolve with the user's choice, or null if they cancel.
 * Re-uses a single mount element so opening twice doesn't stack modals.
 */
export function showNewSessionDialog(
  mount: HTMLElement,
  opts: NewSessionDialogOptions,
): Promise<NewSessionResult | null> {
  return new Promise((resolve) => {
    mount.innerHTML = '';
    mount.classList.add('open');

    const root = document.createElement('div');
    root.className = 'dialog dialog-new-session';
    root.innerHTML = `
      <div class="dlg-titlebar">
        <div class="dlg-eyebrow">
          <span class="dlg-eyebrow-label">NEW</span>
          <span class="dlg-eyebrow-dot"></span>
          <span class="dlg-eyebrow-title">Session</span>
        </div>
        <button class="dlg-close" id="ns-close" title="Close">×</button>
      </div>

      <section class="dlg-section">
        <div class="dlg-label">SHELL</div>
        <select id="ns-shell" class="dlg-input">
          <option value="pwsh">PowerShell 7 (pwsh)</option>
          <option value="powershell">Windows PowerShell</option>
          <option value="cmd">Command Prompt</option>
          <option value="bash">bash</option>
          <option value="zsh">zsh</option>
          <option value="wsl">WSL</option>
        </select>
      </section>

      <section class="dlg-section">
        <div class="dlg-label">WORKING DIRECTORY</div>
        <input id="ns-cwd" type="text" class="dlg-input" />
      </section>

      <div class="dlg-footer">
        <button id="ns-cancel" class="dlg-btn">Cancel</button>
        <button id="ns-open" class="dlg-btn dlg-btn-primary">Open</button>
      </div>
    `;
    mount.appendChild(root);

    const shellEl = root.querySelector<HTMLSelectElement>('#ns-shell')!;
    const cwdEl = root.querySelector<HTMLInputElement>('#ns-cwd')!;
    const openEl = root.querySelector<HTMLButtonElement>('#ns-open')!;
    const cancelEl = root.querySelector<HTMLButtonElement>('#ns-cancel')!;
    root.querySelector<HTMLButtonElement>('#ns-close')!.addEventListener('click', () => cleanup(null));

    shellEl.value = opts.defaultShell;
    cwdEl.value = opts.defaultCwd;
    cwdEl.focus();
    cwdEl.select();

    const cleanup = (result: NewSessionResult | null): void => {
      mount.classList.remove('open');
      mount.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };

    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') { ev.preventDefault(); cleanup(null); }
      else if (ev.key === 'Enter' && (ev.target as HTMLElement).tagName !== 'BUTTON') {
        ev.preventDefault();
        submit();
      }
    };
    document.addEventListener('keydown', onKey);

    function submit(): void {
      const shell = shellEl.value as Shell;
      const cwd = cwdEl.value.trim();
      if (!cwd) return;
      cleanup({ shell, cwd });
    }

    openEl.addEventListener('click', submit);
    cancelEl.addEventListener('click', () => cleanup(null));
    mount.addEventListener('click', (ev) => {
      if (ev.target === mount) cleanup(null);
    });
  });
}

/**
 * Show a modal that prompts for a new tab title. Resolves with the trimmed title, or
 * null if cancelled. Used instead of window.prompt(), which Electron renderers disable.
 */
export function showRenameDialog(
  mount: HTMLElement,
  currentTitle: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    mount.innerHTML = '';
    mount.classList.add('open');

    const root = document.createElement('div');
    root.className = 'dialog dialog-rename';
    root.innerHTML = `
      <div class="dlg-titlebar">
        <div class="dlg-eyebrow">
          <span class="dlg-eyebrow-label">RENAME</span>
          <span class="dlg-eyebrow-dot"></span>
          <span class="dlg-eyebrow-title">Tab</span>
        </div>
        <button class="dlg-close" id="rn-close" title="Close">×</button>
      </div>

      <section class="dlg-section">
        <div class="dlg-label">TITLE</div>
        <input id="rn-title" type="text" class="dlg-input" />
      </section>

      <div class="dlg-footer">
        <button id="rn-cancel" class="dlg-btn">Cancel</button>
        <button id="rn-ok" class="dlg-btn dlg-btn-primary">Rename</button>
      </div>
    `;
    mount.appendChild(root);

    const titleEl = root.querySelector<HTMLInputElement>('#rn-title')!;
    const okEl = root.querySelector<HTMLButtonElement>('#rn-ok')!;
    const cancelEl = root.querySelector<HTMLButtonElement>('#rn-cancel')!;
    root.querySelector<HTMLButtonElement>('#rn-close')!.addEventListener('click', () => cleanup(null));

    titleEl.value = currentTitle;
    titleEl.focus();
    titleEl.select();

    const cleanup = (result: string | null): void => {
      mount.classList.remove('open');
      mount.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };

    function submit(): void {
      const title = titleEl.value.trim();
      if (!title) return;
      cleanup(title);
    }

    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') { ev.preventDefault(); cleanup(null); }
      else if (ev.key === 'Enter' && (ev.target as HTMLElement).tagName !== 'BUTTON') {
        ev.preventDefault();
        submit();
      }
    };
    document.addEventListener('keydown', onKey);

    okEl.addEventListener('click', submit);
    cancelEl.addEventListener('click', () => cleanup(null));
    mount.addEventListener('click', (ev) => {
      if (ev.target === mount) cleanup(null);
    });
  });
}
