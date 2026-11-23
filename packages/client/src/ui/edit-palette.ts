import type { MaterialManifest, PropManifest } from '@demodogs/shared';
import type { Content } from '@demodogs/sim';
import { PROP_GROUPS, propGroup, type PropGroup } from '../game/track-edit';
import type { Art } from '../render/art';
import { PITCH } from '../render/scene';
import { StackRenderer, tall } from '../render/stack';

export type PaletteMode = 'props' | 'pools' | 'surfaces' | 'areas' | null;

export interface PaletteHooks {
  /** A thing or a material was tapped: it is what goes down next. */
  chose(kind: 'prop' | 'material', id: string): void;
  /** A thing is being dragged off the tray, over this point of the screen (CSS px). */
  carry(id: string, cx: number, cy: number): void;
  /** It was let go there (`on` is false when the drag was called off). */
  drop(id: string, cx: number, cy: number, on: boolean): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

const byName = <T extends { meta: { name: string } }>(a: T, b: T): number =>
  a.meta.name < b.meta.name ? -1 : a.meta.name > b.meta.name ? 1 : 0;

/** Does a car feel this material under its wheels? Those are the ones worth laying as road. */
export const underWheel = (m: MaterialManifest): boolean => m.grip < 1 || m.drag > 0;

/**
 * The track creator's tray along the bottom of the screen: every thing that can be put down, as a
 * picture of itself, in groups; and the materials for pools and stretches of road as swatches.
 * Tap one to choose it, or drag a thing off the tray and let go of it on the map.
 */
export class EditPalette {
  /** The thing and the materials in hand. */
  prop: string;
  pool: string;
  surface: string;
  /** The ground of the next area of terrain: a material, or none (the weather alone). */
  area: string;
  private mode: PaletteMode = null;
  private group: PropGroup | 'all' = 'pieces';
  private shut = false;
  private readonly chips = el('div', { className: 'chips' });
  private readonly tiles = el('div', { className: 'tiles' });
  private readonly props: PropManifest[];
  private readonly mats: MaterialManifest[];
  private readonly drawn = new Map<string, HTMLCanvasElement>();
  private queue: string[] = [];
  private busy = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly content: Content,
    private readonly art: Art,
    private readonly hooks: PaletteHooks,
  ) {
    this.props = [...content.prop.values()].sort(byName);
    this.mats = [...content.material.values()].sort(byName);
    this.prop = (this.props.find((p) => p.pad) ?? this.props[0])?.id ?? '';
    const wet = this.mats.filter(underWheel);
    this.pool = (wet[0] ?? this.mats[0])?.id ?? '';
    this.surface = this.pool;
    this.area = this.pool;
    if (!this.props.some((p) => propGroup(p) === this.group)) this.group = 'all';
    root.append(this.chips, this.tiles);
    // a mouse wheel over the tray runs along it
    this.tiles.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          this.tiles.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      },
      { passive: false },
    );
  }

  /** Show the tray for a tool (or put it away). */
  show(mode: PaletteMode): void {
    this.mode = mode;
    this.root.classList.toggle('hidden', mode === null);
    if (mode) this.fill();
  }

  /** Choose a thing or a material as if it had been tapped (a script, or the editor itself). */
  choose(id: string): void {
    const p = this.content.prop.get(id);
    if (p) {
      this.prop = id;
      if (this.group !== 'all') this.group = propGroup(p);
    } else if (this.content.material.has(id)) {
      this.setMaterial(id);
    } else return;
    if (this.mode) this.fill();
  }

  private setMaterial(id: string): void {
    if (this.mode === 'surfaces') this.surface = id;
    else if (this.mode === 'areas') this.area = id;
    else this.pool = id;
  }

  private fill(): void {
    const chips: Node[] = [];
    const chip = (label: string, on: boolean, tap: () => void): void => {
      const b = el('button', { textContent: label, className: on ? 'on' : '' });
      b.onclick = tap;
      chips.push(b);
    };
    chip(this.shut ? '▴ SHOW' : '▾ HIDE', false, () => {
      this.shut = !this.shut;
      this.fill();
    });
    this.root.classList.toggle('shut', this.shut);
    const tiles: Node[] = [];
    if (this.mode === 'props') {
      const groups: [PropGroup | 'all', string][] = [...PROP_GROUPS, ['all', 'EVERYTHING']];
      for (const [g, label] of groups) {
        const n = this.props.filter((p) => g === 'all' || propGroup(p) === g).length;
        if (n === 0) continue;
        chip(`${label} ${n}`, g === this.group, () => {
          this.group = g;
          this.fill();
          this.tiles.scrollLeft = 0;
        });
      }
      this.queue = [];
      for (const p of this.props)
        if (this.group === 'all' || propGroup(p) === this.group) tiles.push(this.propTile(p));
      this.work();
    } else {
      const mine =
        this.mode === 'surfaces' ? this.surface : this.mode === 'areas' ? this.area : this.pool;
      const wet = this.mats.filter(underWheel);
      const list: { id: string; name: string; colour: string; about: string }[] = (
        this.mode === 'pools' ? [...wet, ...this.mats.filter((m) => !underWheel(m))] : wet
      ).map((m) => ({ id: m.id, name: m.meta.name, colour: m.colour, about: m.meta.description }));
      // an area may leave the ground alone and bring only its weather
      if (this.mode === 'areas')
        list.unshift({
          id: '',
          name: 'Weather only',
          colour: 'transparent',
          about: 'The ground stays as it is; the area has only its weather.',
        });
      for (const m of list) {
        const sw = el('i');
        sw.style.background = m.colour;
        const b = el(
          'button',
          { className: `tile mat${m.id === mine ? ' on' : ''}`, title: m.about },
          sw,
          el('small', { textContent: m.name }),
        );
        b.dataset.id = m.id;
        b.onclick = () => {
          this.setMaterial(m.id);
          this.fill();
          this.hooks.chose('material', m.id);
        };
        tiles.push(b);
      }
    }
    this.chips.replaceChildren(...chips);
    const left = this.tiles.scrollLeft;
    this.tiles.replaceChildren(...tiles);
    this.tiles.scrollLeft = left;
  }

  private propTile(p: PropManifest): HTMLElement {
    let cv = this.drawn.get(p.id);
    if (!cv) {
      cv = el('canvas', { width: 96, height: 96 });
      this.drawn.set(p.id, cv);
      cv.dataset.todo = '1';
    }
    if (cv.dataset.todo) this.queue.push(p.id);
    const b = el(
      'button',
      { className: `tile${p.id === this.prop ? ' on' : ''}`, title: p.meta.description },
      cv,
      el('small', { textContent: p.meta.name }),
    );
    b.dataset.id = p.id;
    // a tap chooses it; a drag along the tray runs it along; a drag up off it carries the thing
    // out over the map
    let from: { id: number; x: number; y: number; does: 'tap' | 'scroll' | 'carry' } | null = null;
    b.addEventListener('pointerdown', (e) => {
      from = { id: e.pointerId, x: e.clientX, y: e.clientY, does: 'tap' };
      b.setPointerCapture(e.pointerId);
    });
    b.addEventListener('pointermove', (e) => {
      if (!from || from.id !== e.pointerId) return;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      if (from.does === 'tap') {
        if (Math.hypot(dx, dy) < 8) return;
        // a mouse has its wheel for the tray: with it every drag is a carry
        from.does = e.pointerType === 'mouse' || -dy > Math.abs(dx) * 0.4 ? 'carry' : 'scroll';
      }
      if (from.does === 'scroll') {
        this.tiles.scrollLeft -= dx;
        from.x = e.clientX;
      } else this.hooks.carry(p.id, e.clientX, e.clientY);
    });
    const end = (e: PointerEvent, on: boolean): void => {
      if (!from || from.id !== e.pointerId) return;
      const does = from.does;
      from = null;
      if (does === 'scroll') return;
      if (does === 'carry') {
        // let go over the tray or the bar: nothing is put down
        const r = this.root.getBoundingClientRect();
        this.hooks.drop(p.id, e.clientX, e.clientY, on && e.clientY < r.top);
        this.pick(p.id, false);
      } else if (on) this.pick(p.id, true);
    };
    b.addEventListener('pointerup', (e) => end(e, true));
    b.addEventListener('pointercancel', (e) => end(e, false));
    return b;
  }

  private pick(id: string, tell: boolean): void {
    this.prop = id;
    for (const t of this.tiles.children)
      t.classList.toggle('on', (t as HTMLElement).dataset.id === id);
    if (tell) this.hooks.chose('prop', id);
  }

  /** Draw the pictures still owed, a few at a time, so the tray opens at once. */
  private work(): void {
    if (this.busy) return;
    this.busy = true;
    const some = (): void => {
      for (let k = 0; k < 4; k++) {
        const id = this.queue.shift();
        if (id === undefined) {
          this.busy = false;
          return;
        }
        const cv = this.drawn.get(id);
        if (!cv?.dataset.todo) continue;
        delete cv.dataset.todo;
        try {
          this.picture(cv, id);
        } catch {
          // a prop with no look of its own keeps an empty tile and its name
        }
      }
      setTimeout(some, 0);
    };
    setTimeout(some, 0);
  }

  /** A prop standing in the middle of a tile, as big as fits. */
  private picture(cv: HTMLCanvasElement, id: string): void {
    const g = cv.getContext('2d');
    if (!g) return;
    const s = this.art.prop(id);
    const across = Math.hypot(s.cw, s.ch) / s.res;
    const up = tall(s);
    const k = Math.min(
      (cv.width * 0.92) / across,
      (cv.height * 0.92) / (across * Math.sin(PITCH) + up * Math.cos(PITCH)),
    );
    const R = new StackRenderer(g);
    R.setView(k, PITCH);
    R.begin(0, 0, cv.width, cv.height + up * k * Math.cos(PITCH));
    R.group(0);
    R.stack(s, 0, 0, 0, this.content.prop.get(id)?.pad ? 0 : 0.5);
    R.flush();
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
}
