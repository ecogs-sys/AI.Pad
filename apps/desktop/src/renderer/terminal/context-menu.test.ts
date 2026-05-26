// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
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
