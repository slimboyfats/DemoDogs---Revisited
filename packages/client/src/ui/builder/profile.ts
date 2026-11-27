import { RAISE_MAX, RAISE_MIN, RAISE_STEP } from '@demodogs/shared';
import {
  levelHeight,
  levelsIn,
  moveLevel,
  rampOf,
  setLevelHeight,
  setRamp,
  snapTo,
} from '../../game/track-edit';
import type { LevelBuilder } from './builder';
import { h } from './dom';

const NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

/** What a finger on the picture has hold of. */
type Hold =
  | { what: 'level'; part: number; y: number; h0: number }
  | { what: 'cut'; part: number }
  | { what: 'slope'; end: 0 | 1 };

/**
 * The chosen raised stretch seen from the side, in the panel: the road climbing its first slope,
 * each level a flat of its own height, and the slope back down, start on the left and end on the
 * right. It is the stretch's handle, big enough for a thumb and clear of the map:
 *
 *   a level, anywhere on it   drag up or down for its height (a tap picks it)
 *   the knob between two      drag sideways to move the step
 *   the blue knob on a slope  drag sideways: short and steep, or long and gentle
 *
 * The ground on show follows as it is dragged. Nothing here is on the map itself, where a level
 * is only a number on the road.
 */
export class Profile {
  readonly root = h('div', { className: 'profile hidden' });
  private readonly pic = svg('svg', { role: 'img' });
  private hold: (Hold & { id: number }) | null = null;
  /** How the picture was last laid out: its size, and px of it to a px of road and of height. */
  private w = 0;
  private hgt = 0;
  private sx = 1;
  private sy = 1;
  private base = 0;
  private cuts: number[] = [];
  private tops: [number, number] = [0, 0];

  constructor(private readonly b: LevelBuilder) {
    this.pic.setAttribute(
      'aria-label',
      'The raised road from the side: drag its levels and slopes',
    );
    this.root.append(
      this.pic,
      h(
        'div',
        { className: 'ends' },
        h('span', { textContent: 'START' }),
        h('span', { textContent: 'END' }),
      ),
      h('p', {
        className: 'how',
        textContent: 'Drag a level up or down. Drag a knob sideways to move a step or a slope.',
      }),
    );
    this.pic.addEventListener('pointerdown', (e) => this.down(e));
    this.pic.addEventListener('pointermove', (e) => this.move(e));
    const up = (e: PointerEvent): void => {
      if (this.hold?.id !== e.pointerId) return;
      this.hold = null;
      this.b.shaped();
      this.draw();
    };
    this.pic.addEventListener('pointerup', up);
    this.pic.addEventListener('pointercancel', up);
  }

  /** Show the chosen raised stretch as it stands (or nothing, when none is chosen). */
  draw(): void {
    const b = this.b;
    const up = b.up;
    this.root.classList.toggle('hidden', !up);
    if (!up) return;
    const T = b.road();
    const L = levelsIn(T, up);
    const long = Math.max(1, L.len * T.step);
    const w = (this.w = Math.max(160, this.root.clientWidth || 206));
    const hgt = (this.hgt = Math.max(84, Math.min(150, Math.round(w * 0.46))));
    const pad = 10;
    const base = (this.base = hgt - 22);
    const sx = (this.sx = (w - pad * 2) / long);
    const sy = (this.sy = (base - 32) / RAISE_MAX);
    const X = (d: number): number => pad + d * sx;
    const Y = (z: number): number => base - z * sy;
    const cuts = (this.cuts = L.cuts.map((c) => X(c * T.step)));
    const rin = rampOf(T, up, 0);
    const rout = rampOf(T, up, 1);
    this.tops = [X(rin), X(long - rout)];
    const part = Math.min(b.part, L.cuts.length);
    // the slope between two levels, drawn about where one ends and the next begins
    const step = Math.min(
      14,
      ...L.cuts.map((c, j) => ((c - (L.cuts[j - 1] ?? 0)) * T.step * sx) / 3),
    );
    const line: [number, number][] = [
      [X(0), Y(0)],
      [this.tops[0], Y(L.heights[0]!)],
    ];
    cuts.forEach((cx, j) => {
      line.push([cx - step / 2, Y(L.heights[j]!)], [cx + step / 2, Y(L.heights[j + 1]!)]);
    });
    line.push([this.tops[1], Y(L.heights[L.heights.length - 1]!)], [X(long), Y(0)]);
    const kids: SVGElement[] = [];
    const edges = [X(0), ...cuts, X(long)];
    // the level in hand: its column lit, so it is plain what + and - work on
    kids.push(
      svg('rect', {
        x: edges[part]!,
        y: 4,
        width: edges[part + 1]! - edges[part]!,
        height: base - 4,
        rx: 6,
        class: 'col',
      }),
    );
    kids.push(svg('polygon', { points: line.map((p) => p.join(',')).join(' '), class: 'road' }));
    kids.push(svg('line', { x1: 2, y1: base, x2: w - 2, y2: base, class: 'ground' }));
    L.heights.forEach((z, j) => {
      const mid = (edges[j]! + edges[j + 1]!) / 2;
      // (its height is written over the flat of it, clear of the slopes' knobs)
      const flat = (Math.max(edges[j]!, this.tops[0]) + Math.min(edges[j + 1]!, this.tops[1])) / 2;
      // (and higher still where a slope's knob is under it)
      const near = this.tops.some((t) => Math.abs(t - flat) < 30);
      kids.push(
        svg(
          'text',
          { x: flat, y: Y(z) - (near ? 24 : 13), class: j === part ? 'num on' : 'num' },
          String(z),
        ),
      );
      if (L.cuts.length)
        kids.push(svg('text', { x: mid, y: base + 15, class: 'nth' }, String(j + 1)));
    });
    const held = this.hold;
    cuts.forEach((cx, j) => {
      const on = held?.what === 'cut' && held.part === j + 1;
      kids.push(svg('line', { x1: cx, y1: 6, x2: cx, y2: base, class: 'cut' }));
      kids.push(svg('circle', { cx, cy: base, r: 10, class: on ? 'knob on' : 'knob' }));
      kids.push(
        svg('path', {
          d: `M${cx - 5} ${base}h10M${cx - 5} ${base}l3 -3m-3 3l3 3M${cx + 5} ${base}l-3 -3m3 3l-3 3`,
          class: 'arrows',
        }),
      );
    });
    ([0, 1] as const).forEach((end) => {
      const on = held?.what === 'slope' && held.end === end;
      const z = L.heights[end === 0 ? 0 : L.heights.length - 1]!;
      kids.push(
        svg('circle', {
          cx: this.tops[end],
          cy: Y(z),
          r: 9,
          class: on ? 'knob slope on' : 'knob slope',
        }),
      );
    });
    this.pic.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
    this.pic.setAttribute('width', String(w));
    this.pic.setAttribute('height', String(hgt));
    this.pic.replaceChildren(...kids);
  }

  /**
   * Where its handles are on the screen (CSS px), for a script that drags them: the middle of
   * each level, the knob of each step, the knob of each slope; the ends of the road in it, and
   * how many px of it there are to a px of road and to a px of height.
   */
  spots(): {
    x0: number;
    x1: number;
    sx: number;
    sy: number;
    levels: [number, number][];
    cuts: [number, number][];
    slopes: [number, number][];
  } | null {
    const up = this.b.up;
    if (!up) return null;
    const r = this.pic.getBoundingClientRect();
    const k = r.width / (this.w || 1);
    const L = levelsIn(this.b.road(), up);
    const at = (x: number, y: number): [number, number] => [r.left + x * k, r.top + y * k];
    const top = (j: number): number => this.base - L.heights[j]! * this.sy;
    const x1 = this.w - 10;
    const edges = [10, ...this.cuts, x1];
    return {
      x0: r.left + 10 * k,
      x1: r.left + x1 * k,
      sx: this.sx * k,
      sy: this.sy * k,
      // (the flat of each level, low in it: as far from the knobs as it gets)
      levels: L.heights.map((_, j) => {
        const lo = Math.max(edges[j]!, this.tops[0]);
        const hi = Math.min(edges[j + 1]!, this.tops[1]);
        // (a level that is all slope has no flat: the middle of it, then)
        const x = hi > lo ? (lo + hi) / 2 : (edges[j]! + edges[j + 1]!) / 2;
        return at(x, top(j) + (this.base - top(j)) * 0.6);
      }),
      cuts: this.cuts.map((cx) => at(cx, this.base)),
      slopes: [at(this.tops[0], top(0)), at(this.tops[1], top(L.heights.length - 1))],
    };
  }

  /** A point of the screen as a point of the picture. */
  private at(e: PointerEvent): [number, number] {
    const r = this.pic.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * this.w) / (r.width || 1),
      ((e.clientY - r.top) * this.hgt) / (r.height || 1),
    ];
  }

  private down(e: PointerEvent): void {
    const b = this.b;
    const up = b.up;
    if (!up || this.hold || e.button > 0) return;
    e.preventDefault();
    const [x, y] = this.at(e);
    const L = levelsIn(b.road(), up);
    const Y = (z: number): number => this.base - z * this.sy;
    // a knob under the finger comes first; anywhere else is the level it is over
    let best: Hold | null = null;
    // (a knob is taken only from on it or just beside it: the level round it is a thumb wide too)
    let bd = 14;
    this.cuts.forEach((cx, j) => {
      const d = Math.hypot(x - cx, y - this.base);
      if (d < bd) [bd, best] = [d, { what: 'cut', part: j + 1 }];
    });
    ([0, 1] as const).forEach((end) => {
      const z = L.heights[end === 0 ? 0 : L.heights.length - 1]!;
      const d = Math.hypot(x - this.tops[end], y - Y(z));
      if (d < bd) [bd, best] = [d, { what: 'slope', end }];
    });
    if (!best) {
      const part = this.cuts.filter((cx) => x > cx).length;
      best = { what: 'level', part, y, h0: levelHeight(up, part) };
      if (b.part !== part) b.part = part;
    }
    this.hold = { ...(best as Hold), id: e.pointerId };
    this.pic.setPointerCapture(e.pointerId);
    b.ui.render();
  }

  private move(e: PointerEvent): void {
    const hold = this.hold;
    if (!hold || hold.id !== e.pointerId) return;
    const [x, y] = this.at(e);
    const along = (x - 10) / this.sx;
    this.b.shape((up, T) => {
      if (hold.what === 'level') {
        const to = Math.max(
          RAISE_MIN,
          Math.min(RAISE_MAX, snapTo(hold.h0 + (hold.y - y) / this.sy, RAISE_STEP)),
        );
        if (to === levelHeight(up, hold.part)) return false;
        setLevelHeight(up, hold.part, to);
        return true;
      }
      const { a, len } = levelsIn(T, up);
      if (hold.what === 'cut') {
        const i = (a + Math.max(0, Math.min(len, Math.round(along / T.step)))) % T.n;
        return moveLevel(T, up, hold.part, T.x[i]!, T.y[i]!);
      }
      return setRamp(T, up, hold.end, hold.end === 0 ? along : len * T.step - along);
    });
  }
}
