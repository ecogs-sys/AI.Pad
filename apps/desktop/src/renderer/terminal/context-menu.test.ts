// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { h, setChildren } from './dom.js';

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
