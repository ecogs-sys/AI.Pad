// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { h, setChildren } from './dom.js';
import { buildTerminalContextMenu } from './context-menu.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('dom.h()', () => {
  it('creates an element with class, text, and attrs', () => {
    const el = h('div', { class: 'foo bar', text: 'hello', attrs: { 'data-x': '1' } });
    expect(el.tagName).toBe('DIV');
    expect(el.className).toBe('foo bar');
    expect(el.textContent).toBe('hello');
    expect(el.getAttribute('data-x')).toBe('1');
  });

  it('appends string and element children', () => {
    const child = h('span', { text: 'inner' });
    const el = h('div', {}, ['text-', child, null, false, 'tail']);
    expect(el.childNodes.length).toBe(3);
    expect(el.textContent).toBe('text-innertail');
  });

  it('wires event listeners via on', () => {
    let clicked = 0;
    const el = h('button', { on: { click: () => { clicked += 1; } } });
    el.dispatchEvent(new MouseEvent('click'));
    expect(clicked).toBe(1);
  });
});

describe('dom.setChildren()', () => {
  it('replaces existing children', () => {
    const parent = document.createElement('div');
    parent.appendChild(document.createElement('span'));
    parent.appendChild(document.createElement('span'));
    setChildren(parent, [h('p', { text: 'only' })]);
    expect(parent.children.length).toBe(1);
    expect(parent.firstElementChild?.tagName).toBe('P');
  });
});

describe('platform.kbd()', () => {
  it('renders Mod+C as Ctrl+C on Windows/Linux', async () => {
    vi.resetModules();
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    const { kbd } = await import('./platform.js');
    expect(kbd('Mod+C')).toBe('Ctrl+C');
    expect(kbd('Mod+Shift+P')).toBe('Ctrl+Shift+P');
  });

  it('renders Mod+C as ⌘C on macOS (no separator)', async () => {
    vi.resetModules();
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    const { kbd } = await import('./platform.js');
    expect(kbd('Mod+C')).toBe('⌘C');
    expect(kbd('Mod+Shift+P')).toBe('⌘⇧P');
    expect(kbd('Mod+Enter')).toBe('⌘↵');
  });
});

describe('platform.matchShortcut()', () => {
  it('matches Mod+K on Windows (ctrlKey)', async () => {
    vi.resetModules();
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    const { matchShortcut } = await import('./platform.js');
    const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    expect(matchShortcut(ev, 'Mod+K')).toBe(true);
  });

  it('matches Mod+K on macOS (metaKey)', async () => {
    vi.resetModules();
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    const { matchShortcut } = await import('./platform.js');
    const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    expect(matchShortcut(ev, 'Mod+K')).toBe(true);
  });

  it('rejects when wrong modifier is held', async () => {
    vi.resetModules();
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    const { matchShortcut } = await import('./platform.js');
    const ev = new KeyboardEvent('keydown', { key: 'k', shiftKey: true });
    expect(matchShortcut(ev, 'Mod+K')).toBe(false);
  });
});

describe('buildTerminalContextMenu()', () => {
  const baseOpts = {
    hasSelection: true,
    inSplit: true,
    onCopy: () => {},
    onPaste: () => {},
    onSelectAll: () => {},
    onSplitRight: () => {},
    onSplitBelow: () => {},
    onClosePane: () => {},
  };

  it('returns Copy / Paste / Select all + 2 sections of Split + Close pane', () => {
    const items = buildTerminalContextMenu(baseOpts);
    // 3 editing + null + 2 split + null + 1 close = 8 entries (2 separators)
    expect(items.length).toBe(8);
    expect(items[0]?.label).toBe('Copy');
    expect(items[1]?.label).toBe('Paste');
    expect(items[2]?.label).toBe('Select all');
    expect(items[3]).toBeNull();
    expect(items[4]?.label).toBe('Split right');
    expect(items[5]?.label).toBe('Split below');
    expect(items[6]).toBeNull();
    expect(items[7]?.label).toBe('Close pane');
  });

  it('does NOT include Find or Clear items', () => {
    const items = buildTerminalContextMenu(baseOpts);
    const labels = items.filter((i) => i !== null).map((i) => i!.label);
    expect(labels).not.toContain('Find…');
    expect(labels).not.toContain('Clear');
    expect(labels.length).toBe(6);
  });

  it('disables Copy when hasSelection=false', () => {
    const items = buildTerminalContextMenu({ ...baseOpts, hasSelection: false });
    expect(items[0]?.disabled).toBe(true);
  });

  it('enables Copy when hasSelection=true', () => {
    const items = buildTerminalContextMenu({ ...baseOpts, hasSelection: true });
    expect(items[0]?.disabled).toBeFalsy();
  });

  it('disables Close pane when inSplit=false', () => {
    const items = buildTerminalContextMenu({ ...baseOpts, inSplit: false });
    expect(items[7]?.disabled).toBe(true);
  });

  it('marks only Close pane as danger', () => {
    const items = buildTerminalContextMenu(baseOpts);
    const dangerLabels = items.filter((i) => i !== null && i.danger).map((i) => i!.label);
    expect(dangerLabels).toEqual(['Close pane']);
  });

  it('wires each onClick to the matching callback', () => {
    const calls: string[] = [];
    const items = buildTerminalContextMenu({
      hasSelection: true,
      inSplit: true,
      onCopy:       () => calls.push('copy'),
      onPaste:      () => calls.push('paste'),
      onSelectAll:  () => calls.push('selectAll'),
      onSplitRight: () => calls.push('splitRight'),
      onSplitBelow: () => calls.push('splitBelow'),
      onClosePane:  () => calls.push('closePane'),
    });
    items[0]?.onClick?.();
    items[1]?.onClick?.();
    items[2]?.onClick?.();
    items[4]?.onClick?.();
    items[5]?.onClick?.();
    items[7]?.onClick?.();
    expect(calls).toEqual(['copy', 'paste', 'selectAll', 'splitRight', 'splitBelow', 'closePane']);
  });
});
