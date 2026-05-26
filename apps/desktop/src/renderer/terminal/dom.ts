// Tiny DOM helpers. Ported from the design handoff's vanilla-ts/dom.ts so
// the context-menu component matches the design source 1:1.

type Child = Node | string | number | null | undefined | false;

interface HProps {
  /** Space-separated class names. */
  class?: string;
  /** Text content shortcut (set last, after children). */
  text?: string;
  /** Inline style as cssText string or object. */
  style?: string | Partial<CSSStyleDeclaration>;
  /** Arbitrary attributes (data-*, aria-*, title, etc.) */
  attrs?: Record<string, string | number | boolean>;
  /** Event listeners. */
  on?: Partial<Record<keyof HTMLElementEventMap, EventListener>>;
  /** Child nodes / strings / falsy (skipped). */
  children?: Child[];
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: HProps = {},
  children?: Child[],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.style) {
    if (typeof props.style === 'string') el.style.cssText = props.style;
    else Object.assign(el.style, props.style);
  }
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v === false) continue;
      el.setAttribute(k, String(v));
    }
  }
  if (props.on) {
    for (const [k, fn] of Object.entries(props.on)) {
      if (fn) el.addEventListener(k, fn as EventListener);
    }
  }
  const kids = children ?? props.children;
  if (kids) appendChildren(el, kids);
  if (props.text !== undefined) el.textContent = props.text;
  return el;
}

export function appendChildren(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (typeof c === 'string' || typeof c === 'number') {
      parent.appendChild(document.createTextNode(String(c)));
    } else {
      parent.appendChild(c);
    }
  }
}

/** Replace `parent`'s children with `children`. */
export function setChildren(parent: Node, children: Child[]): void {
  while (parent.firstChild) parent.removeChild(parent.firstChild);
  appendChildren(parent, children);
}
