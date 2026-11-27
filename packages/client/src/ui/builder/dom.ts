import { sign } from './icons';

/** An element with its properties and what is in it. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...kids: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k) e.append(k);
  return e;
}

export interface ButtonOptions {
  /** The sign before the words. */
  sign?: string;
  /** What it is for, said to a mouse that rests on it and to a screen reader. */
  title?: string;
  /** The key that does the same, shown in the title. */
  key?: string;
  /** What a script finds it by. */
  act?: string;
  /** `go` (the way forward), `warn` (takes something away), `soft` (a lesser one). */
  kind?: 'go' | 'warn' | 'soft' | 'plain';
  off?: boolean;
  on?: boolean;
}

/** A button: a sign, words, or both. */
export function button(label: string, tap: () => void, o: ButtonOptions = {}): HTMLButtonElement {
  const b = h('button', { type: 'button', disabled: !!o.off });
  if (o.sign) b.append(sign(o.sign));
  if (label) b.append(h('span', { textContent: label }));
  const title = o.title ?? label;
  b.title = o.key ? `${title} (${o.key})` : title;
  b.setAttribute('aria-label', label || title);
  if (o.act) b.dataset.act = o.act;
  if (o.kind && o.kind !== 'plain') b.classList.add(o.kind);
  if (o.on) b.classList.add('on');
  if (!label) b.classList.add('sq');
  b.onclick = tap;
  return b;
}

/** A named part of the panel: small grey words over what they are about. */
export function part(label: string, ...kids: (Node | null | undefined | false)[]): HTMLElement {
  return h(
    'div',
    { className: 'part' },
    h('div', { className: 'lab', textContent: label }),
    ...kids,
  );
}

/**
 * A row of choices of which one is picked: every choice is a button with its own name, so what
 * can be had is read at a glance and taken in one tap.
 */
export function choice<T extends string>(
  name: string,
  options: readonly (readonly [T, string])[],
  now: T,
  pick: (v: T) => void,
  off = false,
): HTMLElement {
  const row = h('div', { className: `seg${off ? ' off' : ''}` });
  row.setAttribute('role', 'radiogroup');
  row.dataset.choice = name;
  for (const [value, label] of options) {
    const b = h('button', { type: 'button', textContent: label, disabled: off });
    b.dataset.value = value;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(value === now));
    if (value === now) b.classList.add('on');
    b.onclick = () => {
      if (value !== now) pick(value);
    };
    row.append(b);
  }
  return row;
}

/** A number with a button either side of it. */
export function stepper(
  name: string,
  text: string,
  by: (dir: -1 | 1) => void,
  least: boolean,
  most: boolean,
): HTMLElement {
  const row = h('div', { className: 'step' });
  row.dataset.step = name;
  row.append(
    button('', () => by(-1), { sign: 'minus', title: 'Less', act: `${name}-less`, off: least }),
    h('b', { textContent: text }),
    button('', () => by(1), { sign: 'plus', title: 'More', act: `${name}-more`, off: most }),
  );
  return row;
}

/** A slider with its number beside it; `set` is told when it is let go. */
export function slider(
  name: string,
  min: number,
  max: number,
  step: number,
  value: number,
  set: (v: number) => void,
): HTMLElement {
  const out = h('b', { textContent: String(value) });
  const i = h('input', {
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
  });
  i.dataset.slide = name;
  i.oninput = () => (out.textContent = i.value);
  i.onchange = () => set(Number(i.value));
  return h('div', { className: 'range' }, i, out);
}
