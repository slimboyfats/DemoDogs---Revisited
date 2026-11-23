import type { SceneryRule, TrackFile } from '@demodogs/shared';
import {
  clampPoint,
  dressingOf,
  installTrack,
  rangeProp,
  sampleTrack,
  trackProblems,
  type Content,
  type Installed,
  type Track,
} from '@demodogs/sim';
import type { Session } from '../game/session';
import {
  History,
  insertPoint,
  nearest,
  nearestSample,
  removePoint,
  resize,
  reverse,
  roadAt,
  snapBridges,
  startAt,
} from '../game/track-edit';
import { pickTrackFile, saveTrackFile } from '../game/tracks';
import { PITCH } from '../render/scene';

export type EditTool = 'road' | 'place' | 'pool' | 'bridge' | 'erase';

const TOOLS: [EditTool, string, string][] = [
  ['road', 'ROAD', 'Drag a point to bend the road. Tap the road to add a point.'],
  ['place', 'THINGS', 'Tap to put the chosen thing down. Drag one to move it.'],
  ['pool', 'POOLS', 'Tap to lay a pool: mud, ice, oil. Drag one to move it.'],
  ['bridge', 'BRIDGE', 'Tap the road to raise a bridge there. Drag one along the road.'],
  ['erase', 'ERASE', 'Tap a thing, a pool, a bridge or a road point to take it away.'],
];

const SIZES: [string, number, number][] = [
  ['SMALL', 1200, 840],
  ['MEDIUM', 1400, 960],
  ['LARGE', 1800, 1240],
  ['HUGE', 2400, 1640],
  ['VAST', 3200, 2200],
];

const STEP = Math.PI / 12;

export interface EditHooks {
  /** What the screen shows: device px size, device px per art px, device px per CSS px. */
  view(): { w: number; h: number; scale: number; dpr: number };
  /** A fresh, frozen session on the track as installed, the camera where it was. */
  rebuild(made: Installed): Session;
  /** Step the zoom (close, wide, the whole map); the button's new label. */
  zoom(): string;
  /** Keep the track (called after every change). */
  save(t: TrackFile): void;
  /** Race the track as it stands, then come back. */
  drive(t: TrackFile): void;
  exit(): void;
}

type Pick = { kind: 'point' | 'item' | 'pool' | 'bridge'; index: number };

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

/** What a dressing rule does, in a few words, for its switch. */
function ruleLabel(content: Content, r: unknown): string {
  const rule = r as Partial<SceneryRule> & { rule?: string; material?: string; on?: string };
  switch (rule.rule) {
    case 'bend-wall':
      return 'Walls on the bends';
    case 'canopy':
      return 'Giant trees';
    case 'build':
      return 'Buildings';
    case 'arch':
      return 'Arches over the road';
    case 'patches': {
      const m = content.material.get(rule.material ?? '')?.meta.name ?? 'Pools';
      return `${m} ${rule.on === 'road' ? 'on the road' : 'off the road'}`;
    }
    case 'barricade':
      return 'Barricades across the road';
    case 'scatter':
      return 'Trees, rocks and scrap';
    case 'roadside':
      return 'Cones, crates and drums';
    case 'border':
      return 'Fence round the map';
    case 'towers':
      return 'Tower blocks';
    case 'field':
      return 'Fields beside the road';
    case 'kerb':
      return 'Things along the kerb';
    default:
      return String(rule.rule ?? 'Scenery');
  }
}

/**
 * The track creator: the same tools as the test range, turned on a track of your own. The road is
 * a loop through points you drag about; things and pools go where you tap. Every change is saved
 * on the device, and the track goes out and comes back as a JSON file. What you see is the real
 * world, built from the track by the same rules a race uses. Also on `window.__dd.editor`.
 */
export class TrackEditor {
  tool: EditTool = 'road';
  /** The track being built. */
  track: TrackFile | null = null;
  /** How things are turned when they are put down, radians. */
  rot = 0;
  /** What is wrong with the track, if anything (it cannot be raced until it is put right). */
  problems: string[] = [];
  private s: Session | null = null;
  private sel: Pick | null = null;
  private history = new History();
  private line: Track | null = null;
  private note = '';
  private noteT = 0;
  private drag: {
    id: number;
    x: number;
    y: number;
    moved: boolean;
    grab: Pick | null;
    changed: boolean;
  } | null = null;

  private readonly toolBtns = new Map<EditTool, HTMLButtonElement>();
  private readonly row2 = el('div', { className: 'row2' });
  private readonly hint = el('span', { className: 'hint' });
  private readonly propSel = el('select');
  private readonly matSel = el('select');
  private readonly sizeIn = el('input', { type: 'range', min: '8', max: '60', value: '22' });
  private readonly lengthIn = el('input', {
    type: 'range',
    min: '80',
    max: '480',
    step: '20',
    value: '220',
  });
  private readonly mapSel = el('select');
  private readonly undoBtn: HTMLButtonElement;
  private readonly zoomBtn: HTMLButtonElement;
  private readonly driveBtn: HTMLButtonElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly tap: HTMLElement,
    private readonly setup: HTMLElement,
    private readonly content: Content,
    private readonly hooks: EditHooks,
  ) {
    const row1 = el('div', { className: 'row1' });
    const btn = (label: string, title: string, on: () => void, cls = ''): HTMLButtonElement => {
      const b = el('button', { textContent: label, title, className: cls });
      b.onclick = on;
      return b;
    };
    for (const [t, label, title] of TOOLS) {
      const b = btn(label, title, () => this.pick(t));
      this.toolBtns.set(t, b);
      row1.append(b);
    }
    row1.append(el('span', { className: 'gap' }));
    this.undoBtn = btn('UNDO', 'Step back', () => this.undo());
    this.zoomBtn = btn('ZOOM', 'Closer, wider, the whole map', () => {
      this.zoomBtn.textContent = this.hooks.zoom();
    });
    this.driveBtn = btn('TEST DRIVE', 'Race it now, then come back', () => this.testDrive(), 'go');
    row1.append(
      this.undoBtn,
      this.zoomBtn,
      btn('SETUP', 'Name, look, road width, laps, map size, scenery', () => this.openSetup()),
      btn('FILE', 'Save the track as a file, or load one', () => this.openFile()),
      this.driveBtn,
      btn('EXIT', 'Back to your tracks', () => hooks.exit()),
    );
    root.append(row1, this.row2);

    for (const p of [...content.prop.values()].sort((a, b) => (a.meta.name < b.meta.name ? -1 : 1)))
      this.propSel.append(new Option(p.meta.name, p.id));
    for (const m of [...content.material.values()].sort((a, b) =>
      a.meta.name < b.meta.name ? -1 : 1,
    ))
      this.matSel.append(new Option(m.meta.name, m.id));

    for (const [label, w, h] of SIZES)
      this.mapSel.append(new Option(`MAP ${label} ${w} × ${h}`, `${w}x${h}`));
    this.mapSel.onchange = () => this.setSize(this.mapSel.value);
    // the slider sets the chosen bridge's length, and the next one's
    this.lengthIn.onchange = () => {
      const sel = this.sel;
      const b = sel?.kind === 'bridge' ? this.track?.bridges[sel.index] : undefined;
      if (b) this.change(() => (b.length = Number(this.lengthIn.value)));
    };
    tap.addEventListener('pointerdown', (e) => this.down(e));
    tap.addEventListener('pointermove', (e) => this.move(e));
    tap.addEventListener('pointerup', (e) => this.up(e));
    tap.addEventListener('pointercancel', () => this.cancel());
  }

  // ---- opening and closing

  /** Take over a session already built on the track (see `install`). */
  open(s: Session, t: TrackFile): void {
    const fresh = this.track?.id !== t.id;
    this.track = t;
    this.adopt(s);
    if (fresh) {
      this.history = new History();
      this.sel = null;
      const [x, y] = t.road.points[0]!;
      s.cam.x = x;
      s.cam.y = y;
    }
    this.line = null;
    this.problems = trackProblems(t);
    this.root.classList.remove('hidden');
    this.tap.classList.remove('hidden');
    this.pick(this.tool);
  }

  close(): void {
    this.s = null;
    this.drag = null;
    this.root.classList.add('hidden');
    this.tap.classList.add('hidden');
    this.setup.classList.add('hidden');
  }

  private adopt(s: Session): void {
    this.s = s;
    s.rate = 0;
    s.follow = false;
  }

  pick(t: EditTool): void {
    this.tool = t;
    for (const [k, b] of this.toolBtns) b.classList.toggle('on', k === t);
    if (this.sel && !this.fits(this.sel)) this.sel = null;
    this.showRow2();
  }

  /** Is this kind of thing what the tool in hand works on? */
  private fits(p: Pick): boolean {
    return (
      this.tool === 'erase' ||
      (this.tool === 'road' && p.kind === 'point') ||
      (this.tool === 'place' && p.kind === 'item') ||
      (this.tool === 'pool' && p.kind === 'pool') ||
      (this.tool === 'bridge' && p.kind === 'bridge')
    );
  }

  private showRow2(): void {
    const t = this.track;
    const r = this.row2;
    r.replaceChildren();
    if (!t) return;
    const btn = (label: string, title: string, on: () => void, off = false): void => {
      const b = el('button', { textContent: label, title, disabled: off });
      b.onclick = on;
      r.append(b);
    };
    const sel = this.sel;
    if (this.tool === 'road') {
      const p = sel?.kind === 'point' ? sel.index : -1;
      btn('DELETE POINT', 'Take the chosen point out of the road', () => this.erase(sel!), p < 0);
      btn('START HERE', 'Put the start line at the chosen point', () => this.setStart(p), p <= 0);
      btn('REVERSE', 'Race the other way round', () =>
        this.change(() => (reverse(t), (this.sel = null))),
      );
      const mine = `${t.size.w}x${t.size.h}`;
      if (![...this.mapSel.options].some((o) => o.value === mine))
        this.mapSel.append(new Option(`MAP ${t.size.w} × ${t.size.h}`, mine));
      this.mapSel.value = mine;
      r.append(this.mapSel);
    } else if (this.tool === 'place') {
      r.append(this.propSel);
      btn('⟲', 'Turn it left', () => this.turn(-STEP));
      btn('⟳', 'Turn it right', () => this.turn(STEP));
      btn('DELETE', 'Take the chosen thing away', () => this.erase(sel!), sel?.kind !== 'item');
    } else if (this.tool === 'pool') {
      r.append(this.matSel, el('label', { textContent: 'SIZE' }), this.sizeIn);
      btn('DELETE', 'Take the chosen pool away', () => this.erase(sel!), sel?.kind !== 'pool');
    }
    if (this.tool === 'bridge') {
      const b = sel?.kind === 'bridge' ? t.bridges[sel.index] : undefined;
      if (b) this.lengthIn.value = String(b.length);
      r.append(el('label', { textContent: 'LENGTH' }), this.lengthIn);
      btn('DELETE', 'Take the chosen bridge away', () => this.erase(sel!), !b);
    }
    this.hint.textContent = TOOLS.find(([k]) => k === this.tool)![2];
    r.append(this.hint);
    this.undoBtn.disabled = this.history.size === 0;
    this.driveBtn.disabled = this.problems.length > 0;
  }

  /** Say something for a moment (it is drawn over the map). */
  say(text: string): void {
    this.note = text;
    this.noteT = 3.5;
  }

  // ---- changing the track

  /**
   * Make a change: remember the track as it was, change it, keep it, and build the world again
   * from it. `light` changes (a thing just put down) are already in the world and skip the build.
   */
  change(edit: () => void, light = false): void {
    const t = this.track;
    if (!t) return;
    this.history.remember(t);
    edit();
    this.commit(light);
  }

  private commit(light = false): void {
    const t = this.track;
    if (!t) return;
    this.line = null;
    snapBridges(t);
    if (this.sel?.kind === 'bridge' && !t.bridges[this.sel.index]) this.sel = null;
    this.problems = trackProblems(t);
    this.hooks.save(t);
    if (!light) this.build();
    this.showRow2();
  }

  /** Build the world again from the track. A road that cannot be raced keeps the old world. */
  private build(): void {
    const t = this.track;
    if (!t || !this.s || this.problems.length) return;
    try {
      this.adopt(this.hooks.rebuild(installTrack(this.content, t)));
    } catch (e) {
      this.say(`That cannot be built: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  undo(): void {
    const back = this.history.undo();
    if (!back) return;
    this.track = back;
    this.sel = null;
    this.commit();
  }

  /** Give the map a new size ("1400x960"), keeping what is on it about its middle. */
  private setSize(size: string): void {
    const t = this.track;
    const [w, h] = size.split('x').map(Number) as [number, number];
    if (!t || !w || !h) return;
    const dx = (w - t.size.w) / 2;
    const dy = (h - t.size.h) / 2;
    this.change(() => resize(t, w, h));
    if (this.s) {
      this.s.cam.x += dx;
      this.s.cam.y += dy;
    }
  }

  private setStart(i: number): void {
    if (i <= 0) return;
    this.change(() => {
      startAt(this.track!, i);
      this.sel = { kind: 'point', index: 0 };
    });
  }

  private turn(by: number): void {
    const t = this.track!;
    const sel = this.sel;
    if (sel?.kind === 'item' && t.items[sel.index])
      this.change(() => (t.items[sel.index]!.rot += by));
    else this.rot += by;
  }

  private erase(p: Pick | null): void {
    const t = this.track;
    if (!t || !p) return;
    if (p.kind === 'point' && t.road.points.length <= 4) {
      this.say('A road needs at least four points.');
      return;
    }
    this.change(() => {
      if (p.kind === 'point') removePoint(t, p.index);
      else if (p.kind === 'item') t.items.splice(p.index, 1);
      else if (p.kind === 'bridge') t.bridges.splice(p.index, 1);
      else t.pools.splice(p.index, 1);
      this.sel = null;
    });
  }

  private testDrive(): void {
    if (this.track && this.problems.length === 0) this.hooks.drive(this.track);
  }

  /** Replace the track with another (a file loaded, a script). */
  load(t: TrackFile): void {
    if (this.track) this.history.remember(this.track);
    this.track = t;
    this.sel = null;
    this.commit();
    const [x, y] = t.road.points[0]!;
    if (this.s) {
      this.s.cam.x = x;
      this.s.cam.y = y;
    }
  }

  // ---- taps and drags

  /** The point on the ground under a point of the screen (CSS px). */
  toWorld(cx: number, cy: number): [number, number] {
    const v = this.hooks.view();
    const s = this.s!;
    return [
      s.cam.x + (cx * v.dpr - v.w / 2) / v.scale,
      s.cam.y + (cy * v.dpr - v.h / 2) / (v.scale * Math.sin(PITCH)),
    ];
  }

  /** Where a point on the ground is on the screen (device px). */
  private toScreen(x: number, y: number): [number, number] {
    const v = this.hooks.view();
    const s = this.s!;
    return [(x - s.cam.x) * v.scale + v.w / 2, (y - s.cam.y) * v.scale * Math.sin(PITCH) + v.h / 2];
  }

  /**
   * How far a finger reaches, in art px. Road points are few and far apart, so a near miss still
   * takes one; things stand close together, and a tap beside one must put another down.
   */
  private reach(kind: Pick['kind'] = 'point'): number {
    const v = this.hooks.view();
    const few = kind === 'point' || kind === 'bridge';
    return Math.max(8, ((few ? 24 : 13) * v.dpr) / v.scale);
  }

  /** What of the track is under (x, y) that the tool in hand works on. */
  private hit(x: number, y: number): Pick | null {
    const t = this.track!;
    const tries: Pick['kind'][] =
      this.tool === 'road'
        ? ['point']
        : this.tool === 'place'
          ? ['item']
          : this.tool === 'pool'
            ? ['pool']
            : this.tool === 'bridge'
              ? ['bridge']
              : ['item', 'pool', 'bridge', 'point'];
    for (const kind of tries) {
      const things =
        kind === 'point'
          ? t.road.points.map(([px, py]) => ({ x: px, y: py }))
          : kind === 'item'
            ? t.items
            : kind === 'bridge'
              ? t.bridges
              : t.pools;
      const index = nearest(things, x, y, this.reach(kind));
      if (index >= 0) return { kind, index };
    }
    return null;
  }

  private down(e: PointerEvent): void {
    e.preventDefault();
    if (!this.s || !this.track || this.drag) return;
    const [x, y] = this.toWorld(e.clientX, e.clientY);
    const grab = this.tool === 'erase' ? null : this.hit(x, y);
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, grab, changed: false };
    this.tap.setPointerCapture(e.pointerId);
    if (grab) {
      this.sel = grab;
      this.showRow2();
    }
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    const s = this.s;
    const t = this.track;
    if (!d || d.id !== e.pointerId || !s || !t) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 7) return;
    d.moved = true;
    const v = this.hooks.view();
    if (!d.grab) {
      // nothing in hand: the map slides under the finger
      s.cam.x = Math.max(0, Math.min(t.size.w, s.cam.x - (dx * v.dpr) / v.scale));
      s.cam.y = Math.max(
        0,
        Math.min(t.size.h, s.cam.y - (dy * v.dpr) / (v.scale * Math.sin(PITCH))),
      );
      d.x = e.clientX;
      d.y = e.clientY;
      return;
    }
    if (!d.changed) {
      this.history.remember(t);
      d.changed = true;
    }
    const [x, y] = this.toWorld(e.clientX, e.clientY);
    const g = d.grab;
    if (g.kind === 'point') {
      t.road.points[g.index] = clampPoint(t, x, y);
      this.line = null;
    } else if (g.kind === 'bridge') {
      // a bridge slides along the road, wherever the finger wanders
      const T = (this.line ??= sampleTrack(t.road.points, 4));
      const i = nearestSample(T, x, y).i;
      Object.assign(t.bridges[g.index]!, { x: Math.round(T.x[i]!), y: Math.round(T.y[i]!) });
    } else {
      const o = g.kind === 'item' ? t.items[g.index]! : t.pools[g.index]!;
      o.x = Math.round(Math.max(12, Math.min(t.size.w - 12, x)));
      o.y = Math.round(Math.max(12, Math.min(t.size.h - 12, y)));
    }
  }

  private up(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    if (d.changed) this.commit();
    else if (!d.moved) this.use(...this.toWorld(e.clientX, e.clientY));
  }

  private cancel(): void {
    const d = this.drag;
    this.drag = null;
    if (d?.changed) this.commit();
  }

  /** Use the tool in hand (or the one named) at a point on the ground: what a tap does. */
  use(x: number, y: number, tool: EditTool = this.tool): void {
    const t = this.track;
    const s = this.s;
    if (!t || !s) return;
    this.tool = tool;
    const at = this.hit(x, y);
    if (tool === 'erase') {
      if (at) this.erase(at);
      return;
    }
    if (at) {
      this.sel = at;
      this.showRow2();
      return;
    }
    const inside = x > 12 && y > 12 && x < t.size.w - 12 && y < t.size.h - 12;
    if (!inside) return;
    if (tool === 'road') {
      const near = roadAt(t.road.points, x, y);
      if (near.d > t.road.width / 2 + this.reach()) {
        this.sel = null;
        this.showRow2();
        return;
      }
      if (t.road.points.length >= 80) {
        this.say('That is as many points as a road can have.');
        return;
      }
      this.change(() => (this.sel = { kind: 'point', index: insertPoint(t, x, y) }));
    } else if (tool === 'place') {
      const def = this.content.prop.get(this.propSel.value);
      if (!def) return;
      if (t.items.length >= 1200) {
        this.say('That is as many things as a track can hold.');
        return;
      }
      // on the road a thing lines up with it (an arrow points down the road); off it, as turned
      const near = roadAt(t.road.points, x, y);
      const rot = (near.d < t.road.width / 2 ? near.a : 0) + this.rot;
      const item = { prop: def.id, x: Math.round(x), y: Math.round(y), rot };
      this.change(() => {
        t.items.push(item);
        this.sel = { kind: 'item', index: t.items.length - 1 };
        // straight into the world as it stands: no need to build it all again for one thing
        rangeProp(s.world, def, item.x, item.y, item.rot);
      }, this.problems.length === 0);
    } else if (tool === 'bridge') {
      const near = roadAt(t.road.points, x, y);
      if (near.d > t.road.width / 2 + this.reach()) return;
      if (t.bridges.length >= 6) {
        this.say('That is as many bridges as a track can have.');
        return;
      }
      this.change(() => {
        t.bridges.push({ x: Math.round(x), y: Math.round(y), length: Number(this.lengthIn.value) });
        this.sel = { kind: 'bridge', index: t.bridges.length - 1 };
      });
    } else {
      if (!this.content.material.has(this.matSel.value)) return;
      if (t.pools.length >= 200) {
        this.say('That is as many pools as a track can hold.');
        return;
      }
      this.change(() => {
        t.pools.push({
          material: this.matSel.value,
          x: Math.round(x),
          y: Math.round(y),
          r: Number(this.sizeIn.value),
        });
        this.sel = { kind: 'pool', index: t.pools.length - 1 };
      });
    }
  }

  // ---- the setup and file sheets

  private sheet(title: string, ...kids: Node[]): HTMLElement {
    const panel = this.setup.firstElementChild as HTMLElement;
    const done = el('button', { textContent: 'DONE' });
    done.onclick = () => this.setup.classList.add('hidden');
    panel.replaceChildren(el('h2', { textContent: title }), ...kids, done);
    this.setup.classList.remove('hidden');
    return panel;
  }

  private openSetup(): void {
    const t = this.track;
    if (!t) return;
    const field = (label: string, input: HTMLElement): HTMLElement =>
      el('label', { className: 'field' }, el('span', { textContent: label }), input);
    const name = el('input', { type: 'text', value: t.name, maxLength: 32 });
    name.onchange = () => {
      const v = name.value.trim();
      if (v) this.change(() => (t.name = v), true);
    };
    const num = (
      value: number,
      min: number,
      max: number,
      step: number,
      set: (v: number) => void,
    ): HTMLElement => {
      const out = el('b', { textContent: String(value) });
      const i = el('input', {
        type: 'range',
        min: String(min),
        max: String(max),
        step: String(step),
        value: String(value),
      });
      i.oninput = () => (out.textContent = i.value);
      i.onchange = () => this.change(() => set(Number(i.value)));
      return el('span', { className: 'num' }, i, out);
    };
    const look = el('select');
    look.append(new Option('Keep this look', ''));
    for (const v of [...this.content.venue.values()].sort((a, b) =>
      a.meta.name < b.meta.name ? -1 : 1,
    ))
      if (v.track && !v.id.startsWith('venue.custom-')) look.append(new Option(v.meta.name, v.id));
    look.onchange = () => {
      const v = this.content.venue.get(look.value);
      if (!v) return;
      this.change(() => {
        t.colors = { ...v.colors };
        t.dressing = dressingOf(v);
        t.look = v.id;
        t.seed = v.seed;
      });
      this.openSetup();
    };
    const size = el('select');
    for (const [label, w, h] of SIZES) size.append(new Option(`${label} ${w} × ${h}`, `${w}x${h}`));
    const mine = `${t.size.w}x${t.size.h}`;
    if (!SIZES.some(([, w, h]) => `${w}x${h}` === mine))
      size.append(new Option(`${t.size.w} × ${t.size.h}`, mine));
    size.value = mine;
    size.onchange = () => this.setSize(size.value);
    const rules = el('div', { className: 'rules' });
    t.dressing.forEach((d) => {
      const box = el('input', { type: 'checkbox', checked: d.on });
      box.onchange = () => this.change(() => (d.on = box.checked));
      rules.append(el('label', {}, box, ruleLabel(this.content, d.rule)));
    });
    const shuffle = el('button', { textContent: 'SHUFFLE THE SCENERY', className: 'small' });
    shuffle.onclick = () => this.change(() => (t.seed = (t.seed * 31 + 17) % 100000));
    this.sheet(
      'TRACK SETUP',
      field('NAME', name),
      field('LOOK', look),
      field(
        'ROAD WIDTH',
        num(t.road.width, 48, 120, 4, (v) => (t.road.width = v)),
      ),
      field(
        'LAPS',
        num(t.laps, 1, 9, 1, (v) => (t.laps = v)),
      ),
      field('MAP SIZE', size),
      field(
        'SCRAP BOTS',
        num(t.bots, 0, 30, 1, (v) => (t.bots = v)),
      ),
      el('h3', { textContent: 'SCENERY THAT FILLS THE MAP' }),
      rules,
      shuffle,
    );
  }

  private openFile(): void {
    const t = this.track;
    if (!t) return;
    const save = el('button', { textContent: 'SAVE AS A FILE' });
    save.onclick = () => saveTrackFile(t);
    const load = el('button', { textContent: 'LOAD A FILE' });
    const msg = el('p', { className: 'tag' });
    load.onclick = () =>
      void pickTrackFile().then((r) => {
        if (!r.ok) {
          msg.textContent = r.error;
          return;
        }
        // a loaded file takes this track's place in the editor, under its own id
        this.load(r.track);
        this.setup.classList.add('hidden');
        this.say(`Loaded ${r.track.name}.`);
      });
    this.sheet(
      'TRACK FILE',
      el('p', {
        className: 'tag',
        textContent:
          'Every change is kept on this device as you make it. A file is for keeping a copy, ' +
          'moving a track to another device, or sending it to somebody.',
      }),
      save,
      load,
      msg,
    );
  }

  // ---- drawing over the map

  /** Once a frame: the road's points, what was put down by hand, and what is chosen. */
  draw(g: CanvasRenderingContext2D, dt: number): void {
    const t = this.track;
    if (!t || !this.s) return;
    const v = this.hooks.view();
    const k = v.dpr;
    const sq = Math.sin(PITCH);
    g.save();
    g.lineJoin = 'round';
    g.lineCap = 'round';
    // the edge of the map
    const [mx0, my0] = this.toScreen(0, 0);
    const [mx1, my1] = this.toScreen(t.size.w, t.size.h);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 1.5 * k;
    g.setLineDash([6 * k, 6 * k]);
    g.strokeRect(mx0, my0, mx1 - mx0, my1 - my0);
    g.setLineDash([]);

    const road = this.tool === 'road' || this.tool === 'erase';
    const bad = this.problems.length > 0;
    const moving = this.drag?.changed && this.drag.grab?.kind === 'point';
    if (road || bad) {
      // the centre line, and while it is being pulled about (or cannot be built) the road's width
      const T = (this.line ??= sampleTrack(t.road.points, 4));
      const path = () => {
        g.beginPath();
        for (let i = 0; i <= T.n; i += 2) {
          const [x, y] = this.toScreen(T.x[i % T.n]!, T.y[i % T.n]!);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
      };
      if (moving || bad) {
        path();
        g.strokeStyle = bad ? 'rgba(255,80,60,0.4)' : 'rgba(255,210,74,0.3)';
        g.lineWidth = t.road.width * v.scale * sq;
        g.stroke();
      }
      path();
      g.strokeStyle = bad ? '#ff5b4a' : '#ffd24a';
      g.lineWidth = 2 * k;
      g.setLineDash([8 * k, 6 * k]);
      g.stroke();
      g.setLineDash([]);
      // which way the race runs, from the start line
      const a = T.a[0]!;
      const [sx, sy] = this.toScreen(T.x[0]!, T.y[0]!);
      const ax = Math.cos(a);
      const ay = Math.sin(a) * sq;
      const al = Math.hypot(ax, ay) || 1;
      this.arrow(g, sx, sy, ax / al, ay / al, 34 * k, '#fff', 3 * k);
      t.road.points.forEach(([px, py], i) => {
        const [x, y] = this.toScreen(px, py);
        const on = this.sel?.kind === 'point' && this.sel.index === i;
        g.beginPath();
        g.arc(x, y, (on ? 11 : 8) * k, 0, Math.PI * 2);
        g.fillStyle = i === 0 ? '#fff' : on ? '#ff6a3d' : '#ffd24a';
        g.fill();
        g.strokeStyle = '#16141c';
        g.lineWidth = 2.5 * k;
        g.stroke();
      });
      const [x0, y0] = this.toScreen(t.road.points[0]![0], t.road.points[0]![1]);
      this.label(g, 'START', x0, y0 - 16 * k, k);
    }
    if (this.tool === 'place' || this.tool === 'erase')
      t.items.forEach((it, i) => {
        const [x, y] = this.toScreen(it.x, it.y);
        const on = this.sel?.kind === 'item' && this.sel.index === i;
        const r = Math.max(6 * k, (this.content.prop.get(it.prop)?.radius ?? 6) * v.scale * 0.9);
        g.beginPath();
        g.ellipse(x, y, r, r * sq, 0, 0, Math.PI * 2);
        g.strokeStyle = on ? '#ff6a3d' : 'rgba(255,255,255,0.85)';
        g.lineWidth = (on ? 3 : 1.5) * k;
        g.stroke();
        const ax = Math.cos(it.rot);
        const ay = Math.sin(it.rot) * sq;
        const al = Math.hypot(ax, ay) || 1;
        this.arrow(g, x, y, ax / al, ay / al, r + 10 * k, on ? '#ff6a3d' : '#fff', 2 * k);
      });
    if (this.tool === 'pool' || this.tool === 'erase')
      t.pools.forEach((p, i) => {
        const [x, y] = this.toScreen(p.x, p.y);
        const on = this.sel?.kind === 'pool' && this.sel.index === i;
        g.beginPath();
        g.ellipse(x, y, p.r * v.scale, p.r * v.scale * sq, 0, 0, Math.PI * 2);
        g.strokeStyle = on ? '#ff6a3d' : 'rgba(120,220,255,0.9)';
        g.lineWidth = (on ? 3 : 1.5) * k;
        g.setLineDash([5 * k, 4 * k]);
        g.stroke();
        g.setLineDash([]);
        // a pool being moved has not been painted where it is going yet
        if (on) this.label(g, this.content.material.get(p.material)?.meta.name ?? '', x, y, k);
      });

    if (this.tool === 'bridge' || this.tool === 'erase')
      t.bridges.forEach((b, i) => {
        const [x, y] = this.toScreen(b.x, b.y);
        const on = this.sel?.kind === 'bridge' && this.sel.index === i;
        g.beginPath();
        g.arc(x, y, (on ? 11 : 8) * k, 0, Math.PI * 2);
        g.fillStyle = on ? '#ff6a3d' : '#7fd4ff';
        g.fill();
        g.strokeStyle = '#16141c';
        g.lineWidth = 2.5 * k;
        g.stroke();
        this.label(g, 'BRIDGE', x, y - 16 * k, k);
      });

    // what is wrong, or what was just said
    this.noteT = Math.max(0, this.noteT - dt);
    const text = this.problems[0] ?? (this.noteT > 0 ? this.note : '');
    if (text) {
      g.font = `700 ${13 * k}px system-ui, sans-serif`;
      g.textAlign = 'center';
      const w = g.measureText(text).width + 20 * k;
      const y = v.h - 26 * k;
      g.fillStyle = this.problems.length ? 'rgba(150,30,20,0.9)' : 'rgba(0,0,0,0.7)';
      g.fillRect(v.w / 2 - w / 2, y - 16 * k, w, 24 * k);
      g.fillStyle = '#fff';
      g.fillText(text, v.w / 2, y);
    }
    g.restore();
  }

  private arrow(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    dx: number,
    dy: number,
    len: number,
    color: string,
    width: number,
  ): void {
    const ex = x + dx * len;
    const ey = y + dy * len;
    const h = width * 3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(ex, ey);
    g.moveTo(ex - dx * h - dy * h * 0.7, ey - dy * h + dx * h * 0.7);
    g.lineTo(ex, ey);
    g.lineTo(ex - dx * h + dy * h * 0.7, ey - dy * h - dx * h * 0.7);
    g.strokeStyle = '#16141c';
    g.lineWidth = width + 2;
    g.stroke();
    g.strokeStyle = color;
    g.lineWidth = width;
    g.stroke();
  }

  private label(g: CanvasRenderingContext2D, text: string, x: number, y: number, k: number): void {
    g.font = `800 ${11 * k}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.lineWidth = 3 * k;
    g.strokeStyle = '#16141c';
    g.strokeText(text, x, y);
    g.fillStyle = '#fff';
    g.fillText(text, x, y);
  }
}
