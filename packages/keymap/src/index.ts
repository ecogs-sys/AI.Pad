/**
 * Plan 1 ships a minimal registry. Plan 2 adds tab shortcuts (Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+1..9).
 * Plan 3 adds split shortcuts (Ctrl+\, Ctrl+Shift+\) and sidebar toggle (Ctrl+B).
 */
export interface KeyBinding {
  id: string;
  description: string;
  accelerator: string; // Electron accelerator syntax, e.g. "CmdOrCtrl+T"
}

export const Bindings = {} as const satisfies Record<string, KeyBinding>;
