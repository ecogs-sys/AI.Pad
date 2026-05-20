/**
 * Plan 1 shipped a minimal registry. Plan 2 adds tab and sidebar shortcuts.
 * Plan 3 will add split shortcuts (Ctrl+\, Ctrl+Shift+\).
 */
export interface KeyBinding {
  id: string;
  description: string;
  /** Electron accelerator syntax. The chrome renderer maps these to keydown matches. */
  accelerator: string;
}

export const Bindings = {
  newTab:        { id: 'newTab',        description: 'New tab',           accelerator: 'CmdOrCtrl+T' },
  closeTab:      { id: 'closeTab',      description: 'Close tab',         accelerator: 'CmdOrCtrl+W' },
  nextTab:       { id: 'nextTab',       description: 'Next tab',          accelerator: 'CmdOrCtrl+Tab' },
  prevTab:       { id: 'prevTab',       description: 'Previous tab',      accelerator: 'CmdOrCtrl+Shift+Tab' },
  jumpTab1:      { id: 'jumpTab1',      description: 'Switch to tab 1',   accelerator: 'CmdOrCtrl+1' },
  jumpTab2:      { id: 'jumpTab2',      description: 'Switch to tab 2',   accelerator: 'CmdOrCtrl+2' },
  jumpTab3:      { id: 'jumpTab3',      description: 'Switch to tab 3',   accelerator: 'CmdOrCtrl+3' },
  jumpTab4:      { id: 'jumpTab4',      description: 'Switch to tab 4',   accelerator: 'CmdOrCtrl+4' },
  jumpTab5:      { id: 'jumpTab5',      description: 'Switch to tab 5',   accelerator: 'CmdOrCtrl+5' },
  jumpTab6:      { id: 'jumpTab6',      description: 'Switch to tab 6',   accelerator: 'CmdOrCtrl+6' },
  jumpTab7:      { id: 'jumpTab7',      description: 'Switch to tab 7',   accelerator: 'CmdOrCtrl+7' },
  jumpTab8:      { id: 'jumpTab8',      description: 'Switch to tab 8',   accelerator: 'CmdOrCtrl+8' },
  jumpTab9:      { id: 'jumpTab9',      description: 'Switch to tab 9',   accelerator: 'CmdOrCtrl+9' },
  toggleSidebar:   { id: 'toggleSidebar',   description: 'Toggle sidebar',      accelerator: 'CmdOrCtrl+B' },
  splitHorizontal: { id: 'splitHorizontal', description: 'Split horizontally', accelerator: 'CmdOrCtrl+\\' },
  splitVertical:   { id: 'splitVertical',   description: 'Split vertically',   accelerator: 'CmdOrCtrl+Shift+\\' },
  closePane:       { id: 'closePane',       description: 'Close pane',         accelerator: 'CmdOrCtrl+Shift+W' },
} as const satisfies Record<string, KeyBinding>;

export type BindingId = keyof typeof Bindings;
