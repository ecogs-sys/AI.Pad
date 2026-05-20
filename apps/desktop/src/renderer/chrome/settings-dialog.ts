import type { AppSettings } from '@aipad/contracts';

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
    root.className = 'dialog';
    root.innerHTML = `
      <h2>Settings</h2>
      <label class="checkbox-row">
        <input id="set-enabled" type="checkbox" />
        Auto-resume rate-limited tabs
      </label>
      <label for="set-detect">Text to detect</label>
      <input id="set-detect" type="text" maxlength="200" />
      <label for="set-response">Response to send</label>
      <input id="set-response" type="text" maxlength="200" />
      <div class="actions">
        <button id="set-cancel">Cancel</button>
        <button id="set-save" class="primary">Save</button>
      </div>
    `;
    mount.appendChild(root);

    const enabledEl = root.querySelector<HTMLInputElement>('#set-enabled')!;
    const detectEl = root.querySelector<HTMLInputElement>('#set-detect')!;
    const responseEl = root.querySelector<HTMLInputElement>('#set-response')!;
    const saveEl = root.querySelector<HTMLButtonElement>('#set-save')!;
    const cancelEl = root.querySelector<HTMLButtonElement>('#set-cancel')!;

    enabledEl.checked = current.autoResume.enabled;
    detectEl.value = current.autoResume.detectText;
    responseEl.value = current.autoResume.responseText;
    detectEl.focus();
    detectEl.select();

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
      // When enabled, a non-empty detect phrase is required.
      if (enabled && !detectText) {
        detectEl.focus();
        return;
      }
      cleanup({ autoResume: { enabled, detectText, responseText } });
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
