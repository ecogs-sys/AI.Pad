// AI.Pad terminal-pane context menu.
//
// Ported from docs/design_handoff_aipad_redesign/vanilla-ts/context-menu.ts
// with Find and Clear items removed per the 2026-05-26 spec.

export interface ContextMenuItem {
  label: string;
  shortcut?: string;
  icon?: string;
  disabled?: boolean;
  /** Styles the item in red — use for destructive actions like Close pane. */
  danger?: boolean;
  onClick?: () => void;
}

/** Pass a `null` between items to insert a separator line. */
export type ContextMenuSection = (ContextMenuItem | null)[];

export interface TerminalMenuOptions {
  /** True when text is selected in the terminal — gates Copy. */
  hasSelection: boolean;
  /** True when this pane is part of a split — gates Close pane. */
  inSplit: boolean;
  onCopy:        () => void;
  onPaste:       () => void;
  onSelectAll:   () => void;
  onSplitRight:  () => void;
  onSplitBelow:  () => void;
  onClosePane:   () => void;
}

export function buildTerminalContextMenu(opts: TerminalMenuOptions): ContextMenuSection {
  return [
    { label: 'Copy',        shortcut: 'Mod+C', icon: '⎘', disabled: !opts.hasSelection, onClick: opts.onCopy },
    { label: 'Paste',       shortcut: 'Mod+V', icon: '⎙', onClick: opts.onPaste },
    { label: 'Select all',  shortcut: 'Mod+A',            onClick: opts.onSelectAll },
    null,
    { label: 'Split right', shortcut: 'Mod+D',            onClick: opts.onSplitRight },
    { label: 'Split below', shortcut: 'Mod+Shift+D',      onClick: opts.onSplitBelow },
    null,
    { label: 'Close pane',  shortcut: 'Mod+W', icon: '×', danger: true, onClick: opts.onClosePane,
      disabled: !opts.inSplit },
  ];
}
