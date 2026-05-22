import type { Shell } from '@aipad/contracts';

export interface NewSessionResult {
  shell: Shell;
  cwd: string;
}

export interface NewSessionDialogOptions {
  defaultShell: Shell;
  defaultCwd: string;
  /** Opens a native folder picker and resolves with the chosen path, or null if the
   * user cancelled. When omitted, the browse button is hidden. */
  pickDirectory?: () => Promise<string | null>;
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
    root.className = 'dialog';
    root.innerHTML = `
      <h2>New tab</h2>
      <label for="ns-shell">Shell</label>
      <select id="ns-shell">
        <option value="pwsh">PowerShell 7 (pwsh)</option>
        <option value="powershell">Windows PowerShell</option>
        <option value="cmd">Command Prompt</option>
        <option value="bash">bash</option>
        <option value="zsh">zsh</option>
        <option value="wsl">WSL</option>
      </select>
      <label for="ns-cwd">Working directory</label>
      <div class="input-row">
        <input id="ns-cwd" type="text" />
        <button id="ns-browse" type="button" class="icon-btn" title="Browse for folder…" aria-label="Browse for folder">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        </button>
      </div>
      <div class="actions">
        <button id="ns-cancel">Cancel</button>
        <button id="ns-open" class="primary">Open</button>
      </div>
    `;
    mount.appendChild(root);

    const shellEl = root.querySelector<HTMLSelectElement>('#ns-shell')!;
    const cwdEl = root.querySelector<HTMLInputElement>('#ns-cwd')!;
    const openEl = root.querySelector<HTMLButtonElement>('#ns-open')!;
    const cancelEl = root.querySelector<HTMLButtonElement>('#ns-cancel')!;
    const browseEl = root.querySelector<HTMLButtonElement>('#ns-browse')!;

    shellEl.value = opts.defaultShell;
    cwdEl.value = opts.defaultCwd;
    cwdEl.focus();
    cwdEl.select();

    if (opts.pickDirectory) {
      browseEl.addEventListener('click', () => {
        void (async () => {
          const picked = await opts.pickDirectory!();
          if (picked) {
            cwdEl.value = picked;
            cwdEl.focus();
          }
        })();
      });
    } else {
      browseEl.style.display = 'none';
    }

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
    root.className = 'dialog';
    root.innerHTML = `
      <h2>Rename tab</h2>
      <label for="rn-title">Title</label>
      <input id="rn-title" type="text" />
      <div class="actions">
        <button id="rn-cancel">Cancel</button>
        <button id="rn-ok" class="primary">Rename</button>
      </div>
    `;
    mount.appendChild(root);

    const titleEl = root.querySelector<HTMLInputElement>('#rn-title')!;
    const okEl = root.querySelector<HTMLButtonElement>('#rn-ok')!;
    const cancelEl = root.querySelector<HTMLButtonElement>('#rn-cancel')!;

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
