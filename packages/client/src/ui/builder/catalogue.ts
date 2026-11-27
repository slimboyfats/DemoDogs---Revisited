import type { MaterialManifest, PropManifest } from '@demodogs/shared';
import type { Content } from '@demodogs/sim';
import { propGroup, type PropGroup } from '../../game/track-edit';
import type { Art } from '../../render/art';
import { PITCH } from '../../render/scene';
import { StackRenderer, tall } from '../../render/stack';
import { h } from './dom';

/** What the catalogue is showing: things to put down, or the materials for one kind of ground. */
export type Shelf = 'things' | 'pools' | 'surfaces' | 'areas' | null;

type Group = PropGroup | 'all' | 'recent';

export interface CatalogueHooks {
  /** A thing or a material was picked: it is what goes down next (or what the chosen one becomes). */
  chose(kind: 'prop' | 'material', id: string): void;
  /** A thing is being carried off the catalogue, over this point of the screen (CSS px). */
  carry(id: string, cx: number, cy: number): void;
  /** It was let go there (`on` is false when the carry was called off). */
  drop(id: string, cx: number, cy: number, on: boolean): void;
}

/** The shelves of things, by short names that fit a phone's panel. */
const GROUPS: [Group, string][] = [
  ['recent', 'LAST USED'],
  ['pieces', 'TRACK'],
  ['animals', 'ANIMALS'],
  ['plants', 'PLANTS'],
  ['bangs', 'BANGS'],
  ['loose', 'LOOSE'],
  ['built', 'BUILT'],
  ['all', 'ALL'],
];

const byName = <T extends { meta: { name: string } }>(a: T, b: T): number =>
  a.meta.name < b.meta.name ? -1 : a.meta.name > b.meta.name ? 1 : 0;

/** Does a car feel this material under its wheels? Those are the ones worth laying as road. */
export const underWheel = (m: MaterialManifest): boolean => m.grip < 1 || m.drag > 0;

/**
 * The level builder's catalogue: every thing that can be put down as a picture of itself, in
 * shelves and found by name, and the materials for pools, areas and stretches of road as
 * swatches. Tap one to pick it; drag a thing off it and let go over the map to put it there.
 * It lies in the panel: down the side of a wide screen, where it scrolls up and down and a thing
 * is carried out sideways; along the bottom of an upright one, where it scrolls sideways and a
 * thing is carried out upwards.
 */
export class Catalogue {
  /** The thing and the materials in hand. */
  prop: string;
  pool: string;
  surface: string;
  /** The ground of the next area: a material, or none (its weather alone). */
  area: string;
  readonly root = h('div', { className: 'cat hidden' });
  private shelf: Shelf = null;
  private group: Group = 'pieces';
  private find = '';
  /** The things put down last, the newest first. */
  private recent: string[] = [];
  private readonly search = h('input', {
    type: 'search',
    placeholder: 'Find a thing',
    enterKeyHint: 'search',
  });
  private readonly shelves = h('div', { className: 'shelves' });
  private readonly tiles = h('div', { className: 'tiles' });
  private readonly props: PropManifest[];
  private readonly mats: MaterialManifest[];
  private readonly drawn = new Map<string, HTMLCanvasElement>();
  private queue: string[] = [];
  private busy = false;

  constructor(
    private readonly content: Content,
    private readonly art: Art,
    private readonly hooks: CatalogueHooks,
  ) {
    this.props = [...content.prop.values()].sort(byName);
    this.mats = [...content.material.values()].sort(byName);
    this.prop = (this.props.find((p) => p.pad) ?? this.props[0])?.id ?? '';
    const wet = this.mats.filter(underWheel);
    this.pool = (wet[0] ?? this.mats[0])?.id ?? '';
    this.surface = this.pool;
    this.area = this.pool;
    if (!this.props.some((p) => propGroup(p) === this.group)) this.group = 'all';
    this.search.setAttribute('aria-label', 'Find a thing by name');
    this.search.oninput = () => {
      this.find = this.search.value.trim().toLowerCase();
      this.fill();
      this.tiles.scrollTo(0, 0);
    };
    this.root.append(this.search, this.shelves, this.tiles);
    // a mouse wheel over a catalogue that runs sideways runs along it
    this.tiles.addEventListener(
      'wheel',
      (e) => {
        if (this.upright() && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          this.tiles.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      },
      { passive: false },
    );
  }

  /** Show a shelf (or put the catalogue away). */
  show(shelf: Shelf): void {
    const was = this.shelf;
    this.shelf = shelf;
    this.root.classList.toggle('hidden', shelf === null);
    this.root.dataset.shelf = shelf ?? '';
    if (shelf && shelf !== was) this.fill();
  }

  /** Mark what is in hand (the chosen thing's own kind, when one is chosen) without picking it. */
  mark(id: string): void {
    for (const t of this.tiles.children)
      t.classList.toggle('on', (t as HTMLElement).dataset.id === id);
  }

  /** The catalogue lies along the bottom of an upright screen, and runs sideways. */
  private upright(): boolean {
    return innerWidth <= innerHeight;
  }

  /** A thing was put down: it is kept among the last used. */
  used(id: string): void {
    if (this.recent[0] === id) return;
    const first = this.recent.length === 0;
    this.recent = [id, ...this.recent.filter((r) => r !== id)].slice(0, 12);
    if (this.shelf === 'things' && (this.group === 'recent' || first)) this.fill();
  }

  /** Pick a thing or a material as if it had been tapped (a script, or the builder itself). */
  choose(id: string): void {
    const p = this.content.prop.get(id);
    if (p) {
      this.prop = id;
      if (this.group !== 'all' && this.group !== 'recent') this.group = propGroup(p);
    } else if (this.content.material.has(id) || id === '') this.setMaterial(id);
    else return;
    if (this.shelf) this.fill();
  }

  private setMaterial(id: string): void {
    if (this.shelf === 'surfaces') this.surface = id;
    else if (this.shelf === 'areas') this.area = id;
    else this.pool = id;
  }

  private fill(): void {
    const tiles: Node[] = [];
    const things = this.shelf === 'things';
    this.search.classList.toggle('hidden', !things);
    this.shelves.classList.toggle('hidden', !things);
    if (things) {
      const inGroup = (p: PropManifest, g: Group): boolean =>
        g === 'all' || (g === 'recent' ? this.recent.includes(p.id) : propGroup(p) === g);
      const chips: Node[] = [];
      for (const [g, label] of GROUPS) {
        if (!this.props.some((p) => inGroup(p, g))) continue;
        const b = h('button', { type: 'button', textContent: label });
        b.dataset.group = g;
        // (a name looked for is looked for on every shelf)
        b.classList.toggle('on', !this.find && g === this.group);
        b.onclick = () => {
          this.group = g;
          this.find = this.search.value = '';
          this.fill();
          this.tiles.scrollTo(0, 0);
        };
        chips.push(b);
      }
      this.shelves.replaceChildren(...chips);
      this.queue = [];
      const shown = this.find
        ? this.props.filter((p) => p.meta.name.toLowerCase().includes(this.find))
        : this.props.filter((p) => inGroup(p, this.group));
      if (!this.find && this.group === 'recent')
        shown.sort((a, b) => this.recent.indexOf(a.id) - this.recent.indexOf(b.id));
      for (const p of shown) tiles.push(this.thing(p));
      if (!shown.length)
        tiles.push(h('p', { className: 'none', textContent: 'Nothing by that name.' }));
      this.work();
    } else {
      const mine =
        this.shelf === 'surfaces' ? this.surface : this.shelf === 'areas' ? this.area : this.pool;
      const wet = this.mats.filter(underWheel);
      const list: { id: string; name: string; colour: string; about: string }[] = (
        this.shelf === 'pools' ? [...wet, ...this.mats.filter((m) => !underWheel(m))] : wet
      ).map((m) => ({ id: m.id, name: m.meta.name, colour: m.colour, about: m.meta.description }));
      // an area may leave the ground alone and bring only its weather
      if (this.shelf === 'areas')
        list.unshift({
          id: '',
          name: 'Weather only',
          colour: 'transparent',
          about: 'The ground stays as it is; the area has only its weather.',
        });
      for (const m of list) {
        const sw = h('i');
        sw.style.background = m.colour;
        const b = h(
          'button',
          { type: 'button', className: `tile mat${m.id === mine ? ' on' : ''}`, title: m.about },
          sw,
          h('small', { textContent: m.name }),
        );
        b.dataset.id = m.id;
        b.onclick = () => {
          this.setMaterial(m.id);
          this.mark(m.id);
          this.hooks.chose('material', m.id);
        };
        tiles.push(b);
      }
    }
    this.tiles.replaceChildren(...tiles);
  }

  private thing(p: PropManifest): HTMLElement {
    let cv = this.drawn.get(p.id);
    if (!cv) {
      cv = h('canvas', { width: 96, height: 96 });
      this.drawn.set(p.id, cv);
      cv.dataset.todo = '1';
    }
    if (cv.dataset.todo) this.queue.push(p.id);
    const b = h(
      'button',
      {
        type: 'button',
        className: `tile${p.id === this.prop ? ' on' : ''}`,
        title: `${p.meta.name}: ${p.meta.description}`,
      },
      cv,
      h('small', { textContent: p.meta.name }),
    );
    b.dataset.id = p.id;
    // A tap picks it. A finger dragged the way the catalogue runs scrolls it (the browser does
    // that itself and calls the pointer off); dragged the other way, out towards the map, it
    // carries the thing. A mouse has its wheel for scrolling: with it every drag is a carry.
    let from: { id: number; x: number; y: number; carried: boolean } | null = null;
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      from = { id: e.pointerId, x: e.clientX, y: e.clientY, carried: false };
      b.setPointerCapture(e.pointerId);
    });
    b.addEventListener('pointermove', (e) => {
      if (!from || from.id !== e.pointerId) return;
      if (!from.carried && Math.hypot(e.clientX - from.x, e.clientY - from.y) < 8) return;
      from.carried = true;
      this.hooks.carry(p.id, e.clientX, e.clientY);
    });
    const end = (e: PointerEvent, on: boolean): void => {
      if (!from || from.id !== e.pointerId) return;
      const carried = from.carried;
      from = null;
      if (carried) {
        // let go over the panel: nothing is put down
        const r = (this.root.closest('.pane') ?? this.root).getBoundingClientRect();
        const over =
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom;
        this.hooks.drop(p.id, e.clientX, e.clientY, on && !over);
        this.prop = p.id;
        this.mark(p.id);
      } else if (on) {
        this.prop = p.id;
        this.mark(p.id);
        this.hooks.chose('prop', p.id);
      }
    };
    b.addEventListener('pointerup', (e) => end(e, true));
    b.addEventListener('pointercancel', (e) => end(e, false));
    // (the tap is taken on pointerup; a keyboard's Enter comes as a click with no pointer)
    b.addEventListener('click', (e) => {
      if (e.detail === 0) {
        this.prop = p.id;
        this.mark(p.id);
        this.hooks.chose('prop', p.id);
      }
    });
    return b;
  }

  /** Draw the pictures still owed, a few at a time, so the catalogue opens at once. */
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
