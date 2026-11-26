import type { PadFrame, PadWay } from '../input/gamepad';

/** A box on the screen: all that picking the next thing needs. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DIR: Record<PadWay, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/**
 * Which of `boxes` is the next one `way` of `from`: the nearest that lies that way, counting a
 * step to the side as dearer than a step along. -1 if nothing lies that way.
 */
export function nextBox(from: Box, boxes: readonly Box[], way: PadWay): number {
  const [dx, dy] = DIR[way];
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  let best = -1;
  let cost = Infinity;
  boxes.forEach((b, i) => {
    const ox = b.x + b.w / 2 - cx;
    const oy = b.y + b.h / 2 - cy;
    const along = ox * dx + oy * dy;
    if (along < 4) return;
    // a box that overlaps this one's row (or column) is straight ahead: nothing to the side
    const overlap = dx
      ? b.y < from.y + from.h && from.y < b.y + b.h
      : b.x < from.x + from.w && from.x < b.x + b.w;
    const across = overlap ? 0 : Math.abs(ox * dy) + Math.abs(oy * dx);
    const c = along + across * 2.5;
    if (c < cost) {
      cost = c;
      best = i;
    }
  });
  return best;
}

const PICKABLE = 'button, input[type="range"], select, a[href], [data-pad]';
/** What B presses, on the screens that have a way back. */
const BACK = /^(BACK|DONE|RESUME|MENU|CLOSE|CANCEL|LEAVE|QUIT)\b/;

/**
 * The menus by gamepad. The stick or the d-pad moves a marker from button to button (the nearest
 * one that way), A presses it, B goes back, and left and right move a slider. It marks with a
 * class (`padAt`) and never takes the keyboard's focus; a touch or the mouse clears the marker.
 */
export class PadMenu {
  private at: HTMLElement | null = null;

  constructor() {
    addEventListener('pointerdown', () => this.mark(null), true);
  }

  /** The screen on top: the last shown one (the settings sheet lies over the rest). */
  private top(): HTMLElement | null {
    const all = [...document.querySelectorAll<HTMLElement>('section.screen:not(.hidden)')];
    return all[all.length - 1] ?? null;
  }

  private items(root: HTMLElement): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>(PICKABLE)].filter((e) => {
      if ((e as HTMLButtonElement).disabled) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && e.closest('.hidden') === null;
    });
  }

  private mark(e: HTMLElement | null): void {
    if (this.at === e) return;
    this.at?.classList.remove('padAt');
    this.at = e;
    e?.classList.add('padAt');
    e?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** Take this frame's presses. Returns true if there is a menu up to take them. */
  frame(f: PadFrame): boolean {
    const root = this.top();
    if (!root) {
      this.mark(null);
      return false;
    }
    if (!f.way && !f.ok && !f.back) return true;
    const items = this.items(root);
    if (this.at && !items.includes(this.at)) this.mark(null);
    if (f.back) {
      const b = items.find((e) => BACK.test((e.textContent ?? '').trim().toUpperCase()));
      if (b) b.click();
      return true;
    }
    if (!this.at) {
      // the first press only shows where the marker is
      this.mark(root.querySelector<HTMLElement>('.go, .on') ?? items[0] ?? null);
      if (this.at && !items.includes(this.at)) this.mark(items[0] ?? null);
      return true;
    }
    const at = this.at;
    if (f.ok) {
      at.click();
      return true;
    }
    if (!f.way) return true;
    if (at instanceof HTMLInputElement && (f.way === 'left' || f.way === 'right')) {
      const step = Number(at.step) || 1;
      const to = Number(at.value) + (f.way === 'right' ? step : -step);
      at.value = String(Math.min(Number(at.max), Math.max(Number(at.min), to)));
      at.dispatchEvent(new Event('input', { bubbles: true }));
      at.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    const box = (e: HTMLElement): Box => {
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    const others = items.filter((e) => e !== at);
    const i = nextBox(box(at), others.map(box), f.way);
    if (i >= 0) this.mark(others[i]!);
    return true;
  }
}
