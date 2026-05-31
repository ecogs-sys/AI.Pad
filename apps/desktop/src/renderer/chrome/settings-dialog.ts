import type { AppSettings } from '@aipad/contracts';
import { IpcChannel } from '@aipad/contracts';

interface Bridge {
  send: (channel: string, payload?: unknown) => Promise<unknown>;
}

/**
 * Show the settings modal pre-filled from `current`. Resolves with the new
 * AppSettings on Save, or null on Cancel/Escape. Mirrors new-session-dialog.ts:
 * re-uses the single #dialog-mount element so opening twice never stacks modals.
 */
export function showSettingsDialog(
  mount: HTMLElement,
  current: AppSettings,
): Promise<AppSettings | null> {
  return new Promise((resolve) => {
    mount.innerHTML = '';
    mount.classList.add('open');

    const root = document.createElement('div');
    root.className = 'dialog dialog-settings';
    root.innerHTML = `
      <div class="dlg-titlebar">
        <div class="dlg-eyebrow">
          <span class="dlg-eyebrow-label">SETTINGS</span>
          <span class="dlg-eyebrow-dot"></span>
          <span class="dlg-eyebrow-title">Auto-resume</span>
        </div>
        <button class="dlg-close" id="set-close" title="Close">×</button>
      </div>

      <section class="dlg-section dlg-toggle-row">
        <button id="set-enabled-toggle" type="button" class="dlg-switch" role="switch" aria-checked="false"><i></i></button>
        <input id="set-enabled" type="checkbox" hidden />
        <div>
          <div class="dlg-toggle-title">Auto-resume rate-limited tabs</div>
          <div class="dlg-toggle-help">When an agent hits its quota and you've set a response below, AI.Pad will send that response automatically once the quota refreshes.</div>
        </div>
      </section>

      <section class="dlg-section">
        <div class="dlg-label">TEXT TO DETECT</div>
        <input id="set-detect" type="text" maxlength="200" class="dlg-input" />
        <div class="dlg-chips" id="set-detect-chips">
          <button type="button" class="dlg-chip" data-detect="You've hit your limit">You've hit your limit</button>
          <button type="button" class="dlg-chip" data-detect="rate limit reached">rate limit reached</button>
          <button type="button" class="dlg-chip" data-detect="quota exceeded">quota exceeded</button>
        </div>
      </section>

      <section class="dlg-section">
        <div class="dlg-label">RESPONSE TO SEND</div>
        <input id="set-response" type="text" maxlength="200" class="dlg-input" />
      </section>

      <section class="dlg-section">
        <div class="dlg-label">DEFAULT WORKING DIRECTORY</div>
        <div class="dlg-path-row">
          <input id="set-default-cwd" type="text" class="dlg-input" />
          <button id="set-default-cwd-browse" type="button" class="dlg-btn">Browse…</button>
        </div>
        <div class="dlg-help">Leave blank to use your home directory.</div>
      </section>

      <div class="dlg-footer">
        <button id="set-cancel" class="dlg-btn">Cancel</button>
        <button id="set-save" class="dlg-btn dlg-btn-primary">Save</button>
      </div>
    `;
    mount.appendChild(root);

    const enabledEl = root.querySelector<HTMLInputElement>('#set-enabled')!;
    const detectEl = root.querySelector<HTMLInputElement>('#set-detect')!;
    const responseEl = root.querySelector<HTMLInputElement>('#set-response')!;
    const defaultCwdEl = root.querySelector<HTMLInputElement>('#set-default-cwd')!;
    const saveEl = root.querySelector<HTMLButtonElement>('#set-save')!;
    const cancelEl = root.querySelector<HTMLButtonElement>('#set-cancel')!;

    const toggleEl = root.querySelector<HTMLButtonElement>('#set-enabled-toggle')!;
    const setToggle = (on: boolean): void => {
      enabledEl.checked = on;
      toggleEl.setAttribute('aria-checked', on ? 'true' : 'false');
      toggleEl.dataset['on'] = on ? '1' : '0';
    };
    setToggle(current.autoResume.enabled);
    toggleEl.addEventListener('click', () => setToggle(!enabledEl.checked));
    root.querySelector<HTMLButtonElement>('#set-close')!.addEventListener('click', () => cleanup(null));

    root.querySelectorAll<HTMLButtonElement>('#set-detect-chips .dlg-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const phrase = chip.dataset['detect'] ?? '';
        detectEl.value = phrase;
        detectEl.focus();
      });
    });

    detectEl.value = current.autoResume.detectText;
    responseEl.value = current.autoResume.responseText;
    defaultCwdEl.value = current.defaultCwd;
    detectEl.focus();
    detectEl.select();

    const bridge = (window as unknown as { aipad: Bridge }).aipad;
    root.querySelector<HTMLButtonElement>('#set-default-cwd-browse')!.addEventListener('click', () => {
      void (async () => {
        try {
          const resp = await bridge.send(IpcChannel.FsPickDirectory, { startPath: defaultCwdEl.value });
          const r = resp as { path?: string; cancelled?: true };
          if (r && typeof r.path === 'string') {
            defaultCwdEl.value = r.path;
          }
        } catch (err) {
          console.warn('[settings] Browse failed:', err);
        }
      })();
    });

    const cleanup = (result: AppSettings | null): void => {
      mount.classList.remove('open');
      mount.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };

    function submit(): void {
      const enabled = enabledEl.checked;
      const detectText = detectEl.value.trim();
      const responseText = responseEl.value;
      const defaultCwd = defaultCwdEl.value.trim();
      if (enabled && !detectText) {
        detectEl.focus();
        return;
      }
      cleanup({ autoResume: { enabled, detectText, responseText }, defaultCwd });
    }

    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') { ev.preventDefault(); cleanup(null); }
      else if (ev.key === 'Enter' && (ev.target as HTMLElement).tagName !== 'BUTTON') {
        ev.preventDefault();
        submit();
      }
    };
    document.addEventListener('keydown', onKey);

    saveEl.addEventListener('click', submit);
    cancelEl.addEventListener('click', () => cleanup(null));
    mount.addEventListener('click', (ev) => {
      if (ev.target === mount) cleanup(null);
    });
  });
}
