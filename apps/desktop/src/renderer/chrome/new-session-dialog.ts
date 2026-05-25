import type { Shell } from '@aipad/contracts';
import { IpcChannel } from '@aipad/contracts';

export interface NewSessionResult {
  shell: Shell;
  cwd: string;
}

export interface NewSessionDialogOptions {
  defaultShell: Shell;
  defaultCwd: string;
}

interface Bridge {
  send: (channel: string, payload?: unknown) => Promise<unknown>;
}

interface State {
  shell: Shell;
  cwd: string;
  error: string | null;
}

/**
 * Show the redesigned New Session dialog. Resolves with the user's choice, or
 * null if they cancel. Re-uses a single mount element — opening twice doesn't
 * stack modals.
 */
export function showNewSessionDialog(
  mount: HTMLElement,
  opts: NewSessionDialogOptions,
): Promise<NewSessionResult | null> {
  return new Promise((resolve) => {
    mount.innerHTML = '';
    mount.classList.add('open');

    const state: State = {
      shell: opts.defaultShell,
      cwd: opts.defaultCwd,
      error: null,
    };

    const root = document.createElement('div');
    root.className = 'aip-modal aip-modal--newsession';
    root.innerHTML = `
      <div class="aip-modal__header">
        <div class="aip-modal__header-left">
          <span class="aip-modal__crumb">New session</span>
          <span class="aip-modal__crumb-dot"></span>
          <span class="aip-modal__title">Configure</span>
        </div>
        <button class="aip-modal__close" id="ns-close" title="Close" type="button">×</button>
      </div>
      <div class="aip-modal__body"></div>
      <div class="aip-modal__footer">
        <div class="aip-modal__footer-hint">Press Enter to start  ·  Esc to cancel</div>
        <div class="aip-modal__footer-actions">
          <button class="aip-btn aip-btn--ghost"   id="ns-cancel" type="button">Cancel</button>
          <button class="aip-btn aip-btn--primary" id="ns-start"  type="button">Start session</button>
        </div>
      </div>
    `;
    mount.appendChild(root);

    const cleanup = (result: NewSessionResult | null): void => {
      mount.classList.remove('open');
      mount.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };

    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') { ev.preventDefault(); cleanup(null); }
    };
    document.addEventListener('keydown', onKey);

    root.querySelector<HTMLButtonElement>('#ns-close')!.addEventListener('click', () => cleanup(null));
    root.querySelector<HTMLButtonElement>('#ns-cancel')!.addEventListener('click', () => cleanup(null));
    mount.addEventListener('click', (ev) => {
      if (ev.target === mount) cleanup(null);
    });

    // Subsequent steps (7.2-7.4) wire body content + Start button.
    void state; void IpcChannel; // suppress unused-warning until later steps fill these in
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
