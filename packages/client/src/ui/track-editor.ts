import {
  RAISE_MAX,
  RAISE_MIN,
  RAISE_STEP,
  SIZE_STEP,
  sizeStep,
  sizedId,
  type SceneryRule,
  type TrackFile,
} from '@demodogs/shared';
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
  drawRoad,
  History,
  insertPoint,
  nearest,
  nearestSample,
  raisedAt,
  raisedBetween,
  removePoint,
  resize,
  reverse,
  roadAt,
  snapBridges,
  startAt,
  surfaceAt,
  surfaceBetween,
} from '../game/track-edit';
import { pickTrackFile, saveTrackFile } from '../game/tracks';
import type { Art } from '../render/art';
import { SKIES } from '../render/atmosphere';
import { PITCH } from '../render/scene';
import { StackRenderer } from '../render/stack';
import { EditPalette } from './edit-palette';

export type EditTool =
  'road' | 'surface' | 'raise' | 'area' | 'place' | 'pool' | 'bridge' | 'erase';

/** How high a stretch of road stands when it is first raised (art px). */
const RAISE_FIRST = 20;

const TOOLS: [EditTool, string, string][] = [
  ['road', 'ROAD', 'Drag a point to bend the road. Tap the road to add a point.'],
  [
    'surface',
    'ROAD TYPE',
    'Pick a surface, then drag along the road to lay it. Tap for a short stretch.',
  ],
  [
    'raise',
    'ELEVATE',
    'Drag along the road to raise that stretch into a platform. Tap one to choose it.',
  ],
  [
    'area',
    'TERRAIN',
    'Pick the ground and the weather, then tap to lay an area of it. Drag its middle to move it.',
  ],
  [
    'place',
    'THINGS',
    'Drag a thing from the tray onto the map, or tap the map. Drag one to move it.',
  ],
  ['pool', 'POOLS', 'Pick what it is made of, then tap to lay a pool. Drag one to move it.'],
  ['bridge', 'BRIDGE', 'Tap the road to raise a bridge there. Drag one along the road.'],
  [
    'erase',
    'ERASE',
    'Tap a thing, a pool, a bridge, a stretch of surface, a raised stretch or a road point to take it away.',
  ],
];

const PENCIL_HINT =
  'Draw with a finger: a whole loop for a new road, or from the road to the road for a new way round.';

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
  /** Show the map at this many device px to an art px, from this frame on. */
  setZoom(scale: number): void;
  /** The widest and the closest the map may be shown (device px to an art px). */
  zoomRange(): [number, number];
  /** Keep the track (called after every change). */
  save(t: TrackFile): void;
  /** Race the track as it stands, then come back. */
  drive(t: TrackFile): void;
  exit(): void;
}

type Pick = {
  kind: 'point' | 'item' | 'pool' | 'bridge' | 'surface' | 'raised' | 'area';
  index: number;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

/** Give a thing a size (the nearest it can have); its usual size is not written down. */
function setSize(it: TrackFile['items'][number], k: number): void {
  const size = sizeStep(k);
  if (size === 1) delete it.size;
  else it.size = size;
}

/** A sky's name as the weather picker shows it. */
const skyLabel = (name: string): string =>
  name === 'day' ? 'CLEAR DAY' : name.toUpperCase().replace('-', ' AT ');

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
  /** How things are turned when they are put down, radians, and how many times their size. */
  rot = 0;
  size = 1;
  /** How high the next stretch of road to be raised will stand. */
  height = RAISE_FIRST;
  /** Whether the next bridge to be raised has rails. */
  rails = true;
  /** What is wrong with the track, if anything (it cannot be raced until it is put right). */
  problems: string[] = [];
  private s: Session | null = null;
  private sel: Pick | null = null;
  private history = new History();
  private line: Track | null = null;
  private note = '';
  private noteT = 0;
  /** The pencil is out: a drag on the map draws the road. */
  pencil = false;
  private drag: {
    id: number;
    x: number;
    y: number;
    moved: boolean;
    /** What the drag does: slides the map, moves what was grabbed, draws, lays a surface. */
    mode: 'pan' | 'grab' | 'pencil' | 'lay' | 'turn' | 'size';
    /** Resizing: the thing's size and the finger's distance from it when the drag began. */
    k0?: number;
    dist0?: number;
    grab: Pick | null;
    changed: boolean;
    /** Where on the ground it began, and where it is now. */
    from: [number, number];
    to: [number, number];
  } | null = null;
  /** The fingers on the map, and the two-finger pinch they make. */
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; cx: number; cy: number } | null = null;
  private stroke: [number, number][] | null = null;
  /** A thing on its way from the tray, and where the mouse is over the map. */
  private carried: { prop: string; x: number; y: number } | null = null;
  private hover: [number, number] | null = null;
  private stacks: StackRenderer | null = null;
  readonly palette: EditPalette;

  private readonly toolBtns = new Map<EditTool, HTMLButtonElement>();
  private readonly row2 = el('div', { className: 'row2' });
  private readonly hint = el('span', { className: 'hint' });
  private readonly sizeIn = el('input', { type: 'range', min: '8', max: '60', value: '22' });
  private readonly lengthIn = el('input', {
    type: 'range',
    min: '80',
    max: '480',
    step: '20',
    value: '220',
  });
  private readonly areaIn = el('input', {
    type: 'range',
    min: '80',
    max: '600',
    step: '20',
    value: '260',
  });
  private readonly skySel = el('select');
  private readonly mapSel = el('select');
  private readonly undoBtn: HTMLButtonElement;
  private readonly driveBtn: HTMLButtonElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly tap: HTMLElement,
    private readonly setup: HTMLElement,
    tray: HTMLElement,
    private readonly content: Content,
    private readonly art: Art,
    private readonly hooks: EditHooks,
  ) {
    this.palette = new EditPalette(tray, content, art, {
      chose: (kind, id) => this.chose(kind, id),
      carry: (id, cx, cy) => {
        if (!this.s) return;
        const [x, y] = this.toWorld(cx, cy);
        this.carried = { prop: id, x, y };
      },
      drop: (id, cx, cy, on) => {
        this.carried = null;
        if (on && this.s) this.put(id, ...this.toWorld(cx, cy));
      },
    });
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
    this.driveBtn = btn('TEST DRIVE', 'Race it now, then come back', () => this.testDrive(), 'go');
    row1.append(
      this.undoBtn,
      btn('−', 'Further out (or the wheel, or pinch)', () => this.zoomBy(1 / 1.5)),
      btn('+', 'Closer (or the wheel, or pinch)', () => this.zoomBy(1.5)),
      btn('FIT', 'The whole map', () => this.fit()),
      btn('SETUP', 'Name, look, road width, laps, map size, scenery', () => this.openSetup()),
      btn('FILE', 'Save the track as a file, or load one', () => this.openFile()),
      this.driveBtn,
      btn('EXIT', 'Back to your tracks', () => hooks.exit()),
    );
    root.append(row1, this.row2);

    for (const [label, w, h] of SIZES)
      this.mapSel.append(new Option(`MAP ${label} ${w} × ${h}`, `${w}x${h}`));
    this.mapSel.onchange = () => this.setSize(this.mapSel.value);
    this.skySel.append(new Option('WEATHER AS IT IS', ''));
    for (const name of Object.keys(SKIES)) this.skySel.append(new Option(skyLabel(name), name));
    // the weather and the size are the chosen area's, and the next one's
    const area = () => (this.sel?.kind === 'area' ? this.track?.areas[this.sel.index] : undefined);
    this.skySel.onchange = () => {
      const a = area();
      if (a) this.change(() => (a.sky = this.skySel.value));
    };
    this.areaIn.onchange = () => {
      const a = area();
      if (a) this.change(() => (a.r = Number(this.areaIn.value)));
    };
    // the slider sets the chosen bridge's length, and the next one's
    this.lengthIn.onchange = () => {
      const sel = this.sel;
      const b = sel?.kind === 'bridge' ? this.track?.bridges[sel.index] : undefined;
      if (b) this.change(() => (b.length = Number(this.lengthIn.value)));
    };
    tap.addEventListener('pointerdown', (e) => this.down(e));
    tap.addEventListener('pointermove', (e) => this.move(e));
    tap.addEventListener('pointerup', (e) => this.up(e));
    tap.addEventListener('pointercancel', (e) => {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinch = null;
      this.cancel();
    });
    tap.addEventListener('pointerleave', () => (this.hover = null));
    tap.addEventListener('contextmenu', (e) => e.preventDefault());
    // the wheel, and two fingers on a trackpad, zoom about the pointer; a trackpad pinch arrives
    // as a wheel with ctrl held, in finer steps
    tap.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const px = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 300 : 1;
        const by = Math.exp(-e.deltaY * px * (e.ctrlKey || e.metaKey ? 0.01 : 0.002));
        this.zoomAt(e.clientX, e.clientY, Math.max(0.6, Math.min(1.6, by)));
      },
      { passive: false },
    );
    // Safari tells of a trackpad pinch its own way
    let pinched = 1;
    tap.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      pinched = 1;
    });
    tap.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      const g = e as Event & { scale?: number; clientX?: number; clientY?: number };
      if (this.touches.size > 0 || !g.scale) return;
      this.zoomAt(g.clientX ?? innerWidth / 2, g.clientY ?? innerHeight / 2, g.scale / pinched);
      pinched = g.scale;
    });
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
    this.pinch = null;
    this.stroke = null;
    this.carried = null;
    this.hover = null;
    this.touches.clear();
    this.palette.show(null);
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
    if (t !== 'road') this.pencil = false;
    for (const [k, b] of this.toolBtns) b.classList.toggle('on', k === t);
    if (this.sel && !this.fits(this.sel)) this.sel = null;
    this.palette.show(
      t === 'place'
        ? 'props'
        : t === 'pool'
          ? 'pools'
          : t === 'surface'
            ? 'surfaces'
            : t === 'area'
              ? 'areas'
              : null,
    );
    this.showRow2();
  }

  /** Is this kind of thing what the tool in hand works on? */
  private fits(p: Pick): boolean {
    return (
      this.tool === 'erase' ||
      (this.tool === 'road' && p.kind === 'point') ||
      (this.tool === 'surface' && p.kind === 'surface') ||
      (this.tool === 'raise' && p.kind === 'raised') ||
      (this.tool === 'area' && p.kind === 'area') ||
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
    const btn = (label: string, title: string, on: () => void, off = false, lit = false): void => {
      const b = el('button', { textContent: label, title, disabled: off });
      b.classList.toggle('on', lit);
      b.onclick = on;
      r.append(b);
    };
    const sel = this.sel;
    if (this.tool === 'road') {
      const p = sel?.kind === 'point' ? sel.index : -1;
      btn(
        '✎ PENCIL',
        'Draw the road with a finger',
        () => {
          this.pencil = !this.pencil;
          this.showRow2();
        },
        false,
        this.pencil,
      );
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
    } else if (this.tool === 'surface') {
      const on = sel?.kind === 'surface';
      btn('DELETE', 'Take the chosen stretch of surface away', () => this.erase(sel!), !on);
    } else if (this.tool === 'raise') {
      const up = sel?.kind === 'raised' ? t.raised[sel.index] : undefined;
      const h = up ? up.height : this.height;
      btn('LOWER', 'Bring it down', () => this.raiseBy(-RAISE_STEP), h <= RAISE_MIN);
      r.append(el('label', { textContent: `${up ? 'CHOSEN' : 'NEXT'}: ↑ ${h}` }));
      btn('HIGHER', 'Lift it up', () => this.raiseBy(RAISE_STEP), h >= RAISE_MAX);
      btn('DELETE', 'Put the chosen stretch back on the ground', () => this.erase(sel!), !up);
    } else if (this.tool === 'area') {
      const a = sel?.kind === 'area' ? t.areas[sel.index] : undefined;
      if (a) {
        this.skySel.value = a.sky;
        this.areaIn.value = String(a.r);
      }
      r.append(this.skySel, el('label', { textContent: 'SIZE' }), this.areaIn);
      btn('DELETE', 'Take the chosen area away', () => this.erase(sel!), !a);
    } else if (this.tool === 'place') {
      const it = sel?.kind === 'item' ? t.items[sel.index] : undefined;
      const name = this.content.prop.get(it?.prop ?? this.palette.prop)?.meta.name ?? '';
      r.append(el('label', { textContent: `${it ? 'CHOSEN' : 'NEXT'}: ${name.toUpperCase()}` }));
      const k = it ? (it.size ?? 1) : this.size;
      const fixed = !!this.content.prop.get(it?.prop ?? this.palette.prop)?.critter;
      btn('⟲', 'Turn it left', () => this.turn(-STEP));
      btn('⟳', 'Turn it right', () => this.turn(STEP));
      btn('SMALLER', 'Make it smaller', () => this.resizeBy(-SIZE_STEP), fixed || k <= sizeStep(0));
      r.append(el('label', { textContent: `× ${k}` }));
      btn('BIGGER', 'Make it bigger', () => this.resizeBy(SIZE_STEP), fixed || k >= sizeStep(99));
      btn('DELETE', 'Take the chosen thing away', () => this.erase(sel!), !it);
      if (it) {
        btn('DONE', 'Let go of it', () => {
          this.sel = null;
          this.showRow2();
        });
        this.hint.textContent =
          'Drag it to move it, the round handle to turn it, the square one to resize it. ' +
          'Tap a thing in the tray to change it into that.';
        r.append(this.hint);
        this.undoBtn.disabled = this.history.size === 0;
        this.driveBtn.disabled = this.problems.length > 0;
        return;
      }
    } else if (this.tool === 'pool') {
      r.append(el('label', { textContent: 'SIZE' }), this.sizeIn);
      btn('DELETE', 'Take the chosen pool away', () => this.erase(sel!), sel?.kind !== 'pool');
    }
    if (this.tool === 'bridge') {
      const b = sel?.kind === 'bridge' ? t.bridges[sel.index] : undefined;
      if (b) this.lengthIn.value = String(b.length);
      r.append(el('label', { textContent: 'LENGTH' }), this.lengthIn);
      const railed = b ? b.rails !== false : this.rails;
      btn(
        railed ? 'RAILS ON' : 'RAILS OFF',
        'With no rails a car can drive off the edge and fall',
        () => {
          if (b)
            this.change(() => {
              if (railed) b.rails = false;
              else delete b.rails;
            });
          else {
            this.rails = !this.rails;
            this.showRow2();
          }
        },
        false,
        railed,
      );
      btn('DELETE', 'Take the chosen bridge away', () => this.erase(sel!), !b);
    }
    this.hint.textContent = this.pencil ? PENCIL_HINT : TOOLS.find(([k]) => k === this.tool)![2];
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
    if (this.sel?.kind === 'surface' && !t.surfaces[this.sel.index]) this.sel = null;
    if (this.sel?.kind === 'raised' && !t.raised[this.sel.index]) this.sel = null;
    if (this.sel?.kind === 'area' && !t.areas[this.sel.index]) this.sel = null;
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
    else {
      this.rot += by;
      this.showRow2();
    }
  }

  /** Make the chosen thing (or the next one put down) a step bigger or smaller. */
  private resizeBy(by: number): void {
    const t = this.track!;
    const sel = this.sel;
    const it = sel?.kind === 'item' ? t.items[sel.index] : undefined;
    if (it) this.change(() => setSize(it, (it.size ?? 1) + by));
    else {
      this.size = sizeStep(this.size + by);
      this.showRow2();
    }
  }

  /**
   * The handles of the chosen thing, on the screen (device px): the ring they sit on, the round
   * one that turns it (out the way it faces) and the square one that resizes it.
   */
  private handles(it: TrackFile['items'][number]): {
    x: number;
    y: number;
    r: number;
    turn: [number, number];
    size: [number, number];
  } {
    const v = this.hooks.view();
    const [x, y] = this.toScreen(it.x, it.y);
    const radius = (this.content.prop.get(it.prop)?.radius ?? 6) * (it.size ?? 1);
    const r = Math.max(30 * v.dpr, radius * v.scale + 18 * v.dpr);
    const ax = Math.cos(it.rot);
    const ay = Math.sin(it.rot) * Math.sin(PITCH);
    const al = Math.hypot(ax, ay) || 1;
    const turn: [number, number] = [x + (ax / al) * r, y + (ay / al) * r];
    // the square one keeps out of the round one's way
    const d = r * Math.SQRT1_2;
    const size: [number, number] =
      Math.hypot(turn[0] - (x + d), turn[1] - (y + d)) > 30 * v.dpr
        ? [x + d, y + d]
        : [x - d, y + d];
    return { x, y, r, turn, size };
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
      else if (p.kind === 'surface') t.surfaces.splice(p.index, 1);
      else if (p.kind === 'raised') t.raised.splice(p.index, 1);
      else if (p.kind === 'area') t.areas.splice(p.index, 1);
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
    const few = kind === 'point' || kind === 'bridge' || kind === 'area';
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
              : this.tool === 'surface'
                ? ['surface']
                : this.tool === 'raise'
                  ? ['raised']
                  : this.tool === 'area'
                    ? ['area']
                    : ['item', 'pool', 'bridge', 'point', 'area', 'surface', 'raised'];
    for (const kind of tries) {
      if (kind === 'surface') {
        const index = surfaceAt(this.road(), t, x, y, t.road.width / 2 + this.reach('item'));
        if (index >= 0) return { kind, index };
        continue;
      }
      if (kind === 'raised') {
        const index = raisedAt(this.road(), t, x, y, t.road.width / 2 + this.reach('item'));
        if (index >= 0) return { kind, index };
        continue;
      }
      const things =
        kind === 'point'
          ? t.road.points.map(([px, py]) => ({ x: px, y: py }))
          : kind === 'item'
            ? // a tap anywhere on a big thing takes it
              t.items.map((it) => ({
                x: it.x,
                y: it.y,
                r: (this.content.prop.get(it.prop)?.radius ?? 0) * (it.size ?? 1) * 0.6,
              }))
            : kind === 'bridge'
              ? t.bridges
              : kind === 'area'
                ? t.areas.map(({ x: ax, y: ay }) => ({ x: ax, y: ay }))
                : t.pools;
      const index = nearest(things, x, y, this.reach(kind));
      if (index >= 0) return { kind, index };
    }
    return null;
  }

  /** The road's line as it stands, sampled finely (kept until the road changes). */
  private road(): Track {
    return (this.line ??= sampleTrack(this.track!.road.points, 4));
  }

  /** How a thing put down at (x, y) is turned: along the road if it is on it. */
  private rotAt(x: number, y: number): number {
    const t = this.track!;
    const T = this.road();
    const near = nearestSample(T, x, y);
    return (near.d < t.road.width / 2 ? T.a[near.i]! : 0) + this.rot;
  }

  // ---- the view: sliding and zooming

  private slide(dx: number, dy: number): void {
    const s = this.s;
    const t = this.track;
    if (!s || !t) return;
    const v = this.hooks.view();
    s.cam.x = Math.max(0, Math.min(t.size.w, s.cam.x - (dx * v.dpr) / v.scale));
    s.cam.y = Math.max(0, Math.min(t.size.h, s.cam.y - (dy * v.dpr) / (v.scale * Math.sin(PITCH))));
  }

  /** Zoom by a factor, keeping the ground under a point of the screen (CSS px) where it is. */
  zoomAt(cx: number, cy: number, by: number): void {
    if (!this.s || !this.track) return;
    const [lo, hi] = this.hooks.zoomRange();
    const now = this.hooks.view().scale;
    const k = Math.max(lo, Math.min(hi, now * by));
    if (k === now) return;
    const [x, y] = this.toWorld(cx, cy);
    this.hooks.setZoom(k);
    const [nx, ny] = this.toWorld(cx, cy);
    this.s.cam.x += x - nx;
    this.s.cam.y += y - ny;
    this.slide(0, 0);
  }

  private zoomBy(by: number): void {
    const v = this.hooks.view();
    this.zoomAt(v.w / v.dpr / 2, v.h / v.dpr / 2, by);
  }

  /** The whole map on the screen, between the bar and the tray. */
  fit(): void {
    const t = this.track;
    if (!t || !this.s) return;
    const v = this.hooks.view();
    const [lo, hi] = this.hooks.zoomRange();
    const k = Math.min(v.w / t.size.w, (v.h * 0.6) / (t.size.h * Math.sin(PITCH)));
    this.hooks.setZoom(Math.max(lo, Math.min(hi, k)));
    Object.assign(this.s.cam, { x: t.size.w / 2, y: t.size.h / 2 });
  }

  /** How far apart the two fingers are, and the point midway between them (CSS px). */
  private span(): { d: number; cx: number; cy: number } {
    const [a, b] = [...this.touches.values()] as [
      { x: number; y: number },
      { x: number; y: number },
    ];
    return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  private down(e: PointerEvent): void {
    e.preventDefault();
    const t = this.track;
    if (!this.s || !t) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.tap.setPointerCapture(e.pointerId);
    if (this.touches.size === 2) {
      // a second finger: whatever the first was doing, the two of them now pinch and slide
      this.cancel();
      this.pinch = this.span();
      return;
    }
    if (this.touches.size > 2 || this.drag) return;
    const at = this.toWorld(e.clientX, e.clientY);
    const [x, y] = at;
    let mode: 'pan' | 'grab' | 'pencil' | 'lay' | 'turn' | 'size' = 'pan';
    let grab: Pick | null = null;
    // the middle and right buttons of a mouse always slide the map
    if (e.button !== 1 && e.button !== 2) {
      if (this.tool === 'road' && this.pencil) {
        mode = 'pencil';
        this.stroke = [at];
      } else if (this.tool === 'surface' || this.tool === 'raise') {
        if (nearestSample(this.road(), x, y).d <= t.road.width / 2 + this.reach('item'))
          mode = 'lay';
      } else if (this.tool !== 'erase') {
        // the chosen thing's handles come first: they stand out beyond it
        const sel = this.sel;
        const it = this.tool === 'place' && sel?.kind === 'item' ? t.items[sel.index] : undefined;
        if (it) {
          const v = this.hooks.view();
          const h = this.handles(it);
          const px = e.clientX * v.dpr;
          const py = e.clientY * v.dpr;
          const on = (q: [number, number]) => Math.hypot(px - q[0], py - q[1]) < 20 * v.dpr;
          if (on(h.turn)) mode = 'turn';
          else if (on(h.size) && !this.content.prop.get(it.prop)?.critter) mode = 'size';
          if (mode !== 'pan') {
            this.drag = {
              id: e.pointerId,
              x: e.clientX,
              y: e.clientY,
              moved: false,
              mode,
              grab: sel,
              changed: false,
              from: at,
              to: at,
              k0: it.size ?? 1,
              dist0: Math.hypot(px - h.x, py - h.y) || 1,
            };
            return;
          }
        }
        grab = this.hit(x, y);
        if (grab) mode = 'grab';
      }
    }
    this.drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      mode,
      grab,
      changed: false,
      from: at,
      to: at,
    };
    if (grab) {
      this.sel = grab;
      this.showRow2();
    }
  }

  private move(e: PointerEvent): void {
    const s = this.s;
    const t = this.track;
    if (!s || !t) return;
    const finger = this.touches.get(e.pointerId);
    if (finger) Object.assign(finger, { x: e.clientX, y: e.clientY });
    if (this.pinch) {
      if (this.touches.size < 2) return;
      const now = this.span();
      this.slide(now.cx - this.pinch.cx, now.cy - this.pinch.cy);
      this.zoomAt(now.cx, now.cy, now.d / this.pinch.d);
      this.pinch = now;
      return;
    }
    const d = this.drag;
    if (!d) {
      // a mouse over the map shows what a click would put down
      if (e.pointerType === 'mouse') this.hover = this.toWorld(e.clientX, e.clientY);
      return;
    }
    if (d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 7) return;
    d.moved = true;
    const [x, y] = this.toWorld(e.clientX, e.clientY);
    d.to = [x, y];
    if (d.mode === 'pan') {
      // nothing in hand: the map slides under the finger
      this.slide(dx, dy);
      d.x = e.clientX;
      d.y = e.clientY;
      return;
    }
    if (d.mode === 'pencil') {
      const last = this.stroke?.[this.stroke.length - 1];
      if (last && Math.hypot(x - last[0], y - last[1]) >= 6) this.stroke!.push([x, y]);
      return;
    }
    if (d.mode === 'lay' || !d.grab) return;
    if (!d.changed) {
      this.history.remember(t);
      d.changed = true;
    }
    const g = d.grab;
    if (d.mode === 'turn' || d.mode === 'size') {
      const it = t.items[g.index];
      if (!it) return;
      const v = this.hooks.view();
      const [cx, cy] = this.toScreen(it.x, it.y);
      const px = e.clientX * v.dpr - cx;
      const py = e.clientY * v.dpr - cy;
      if (d.mode === 'turn')
        // it faces the finger, in steps
        it.rot = Math.round(Math.atan2(py / Math.sin(PITCH), px) / STEP) * STEP;
      else setSize(it, (d.k0 ?? 1) * (Math.hypot(px, py) / (d.dist0 ?? 1)));
      return;
    }
    if (g.kind === 'point') {
      t.road.points[g.index] = clampPoint(t, x, y);
      this.line = null;
    } else if (g.kind === 'bridge') {
      // a bridge slides along the road, wherever the finger wanders
      const T = this.road();
      const i = nearestSample(T, x, y).i;
      Object.assign(t.bridges[g.index]!, { x: Math.round(T.x[i]!), y: Math.round(T.y[i]!) });
    } else if (g.kind !== 'surface' && g.kind !== 'raised') {
      const o =
        g.kind === 'item'
          ? t.items[g.index]!
          : g.kind === 'area'
            ? t.areas[g.index]!
            : t.pools[g.index]!;
      o.x = Math.round(Math.max(12, Math.min(t.size.w - 12, x)));
      o.y = Math.round(Math.max(12, Math.min(t.size.h - 12, y)));
    }
  }

  private up(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    if (this.pinch) {
      // the pinch is over when either finger lifts; the one left does nothing more
      this.pinch = null;
      return;
    }
    const d = this.drag;
    const t = this.track;
    if (!d || d.id !== e.pointerId || !t) return;
    this.drag = null;
    const stroke = this.stroke;
    this.stroke = null;
    if (d.mode === 'pencil') {
      if (stroke) this.drawn(stroke);
    } else if (d.mode === 'lay' && d.moved) this.lay(d.from, d.to);
    else if (d.changed) this.commit();
    else if (!d.moved) this.use(...this.toWorld(e.clientX, e.clientY));
  }

  private cancel(): void {
    const d = this.drag;
    this.drag = null;
    this.stroke = null;
    if (d?.changed) this.commit();
  }

  /** The pencil was lifted: make the line the road, if it can be one. */
  private drawn(stroke: [number, number][]): void {
    const t = this.track!;
    const tried = structuredClone(t);
    const what = drawRoad(tried, stroke);
    if (!what) {
      this.say('Draw a longer line: a whole loop, or from one place on the road to another.');
      return;
    }
    this.pencil = false;
    this.change(() => {
      t.road.points = tried.road.points;
      // a whole new road leaves the old one's bridges, surfaces and platforms behind
      if (what === 'loop') {
        t.bridges = [];
        t.surfaces = [];
        t.raised = [];
      }
      this.sel = null;
    });
    this.say(
      this.problems.length
        ? 'UNDO takes the line back.'
        : what === 'loop'
          ? 'A new road. Drag its points to tidy it.'
          : 'A new way round. Drag its points to tidy it.',
    );
  }

  /** Raise the chosen stretch of road, or the next one to be laid, by this much. */
  private raiseBy(by: number): void {
    const t = this.track;
    if (!t) return;
    const step = (h: number): number => Math.max(RAISE_MIN, Math.min(RAISE_MAX, h + by));
    const up = this.sel?.kind === 'raised' ? t.raised[this.sel.index] : undefined;
    if (up) this.change(() => (up.height = step(up.height)));
    else {
      this.height = step(this.height);
      this.showRow2();
    }
  }

  /** Lay the surface in hand along the road between two points on the ground. */
  private lay(p: readonly [number, number], q: readonly [number, number]): void {
    const t = this.track!;
    if (this.tool === 'raise') {
      if (t.raised.length >= 12) {
        this.say('That is as many raised stretches as a track can have.');
        return;
      }
      this.change(() => {
        t.raised.push(raisedBetween(this.road(), this.height, p, q));
        this.sel = { kind: 'raised', index: t.raised.length - 1 };
      });
      return;
    }
    const material = this.palette.surface;
    if (!this.content.material.has(material)) return;
    if (t.surfaces.length >= 24) {
      this.say('That is as many stretches of surface as a track can have.');
      return;
    }
    this.change(() => {
      t.surfaces.push(surfaceBetween(this.road(), material, p, q));
      this.sel = { kind: 'surface', index: t.surfaces.length - 1 };
    });
  }

  /** A thing or a material was picked from the tray. */
  private chose(kind: 'prop' | 'material', id: string): void {
    const t = this.track;
    const sel = this.sel;
    if (!t) return;
    if (kind === 'prop') {
      // the chosen thing becomes what was picked (an animal keeps to its own size)
      const it = sel?.kind === 'item' ? t.items[sel.index] : undefined;
      if (it && it.prop !== id)
        this.change(() => {
          it.prop = id;
          if (this.content.prop.get(id)?.critter) delete it.size;
        });
    } else if (sel?.kind === 'pool' && t.pools[sel.index] && t.pools[sel.index]!.material !== id)
      // the chosen pool or stretch becomes what was picked
      this.change(() => (t.pools[sel.index]!.material = id));
    else if (sel?.kind === 'area' && t.areas[sel.index] && t.areas[sel.index]!.material !== id)
      this.change(() => (t.areas[sel.index]!.material = id));
    else if (
      sel?.kind === 'surface' &&
      t.surfaces[sel.index] &&
      t.surfaces[sel.index]!.material !== id
    )
      this.change(() => (t.surfaces[sel.index]!.material = id));
    this.showRow2();
  }

  /** Put a thing down at a point on the ground (a tap with THINGS, or a drop from the tray). */
  put(prop: string, x: number, y: number): void {
    const t = this.track;
    const s = this.s;
    const def = this.content.prop.get(prop);
    if (!t || !s || !def) return;
    if (!(x > 12 && y > 12 && x < t.size.w - 12 && y < t.size.h - 12)) return;
    if (t.items.length >= 1200) {
      this.say('That is as many things as a track can hold.');
      return;
    }
    if (this.tool !== 'place') this.pick('place');
    // on the road a thing lines up with it (an arrow points down the road); off it, as turned
    const item: TrackFile['items'][number] = {
      prop: def.id,
      x: Math.round(x),
      y: Math.round(y),
      rot: this.rotAt(x, y),
    };
    if (!def.critter) setSize(item, this.size);
    // at its usual size it goes straight into the world as it stands: no need to build it all
    // again for one thing. At another size the world is built again, with a prop of that size.
    const light = this.problems.length === 0 && item.size === undefined;
    this.change(() => {
      t.items.push(item);
      // nothing is chosen: the next tap puts down another
      this.sel = null;
      if (light) rangeProp(s.world, def, item.x, item.y, item.rot);
    }, light);
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
    if (tool === 'place' && this.sel) {
      // a tap on open ground lets go of the chosen thing; the next one puts something down
      this.sel = null;
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
      this.put(this.palette.prop, x, y);
    } else if (tool === 'surface' || tool === 'raise') {
      // a tap lays a short stretch, the tap in the middle of it
      const T = this.road();
      const near = nearestSample(T, x, y);
      if (near.d > t.road.width / 2 + this.reach('item')) {
        this.sel = null;
        this.showRow2();
        return;
      }
      const end = (by: number): [number, number] => {
        const i = (near.i + by + T.n) % T.n;
        return [T.x[i]!, T.y[i]!];
      };
      const half = Math.min(30, Math.floor(T.n / 4));
      this.lay(end(-half), end(half));
    } else if (tool === 'area') {
      const material = this.content.material.has(this.palette.area) ? this.palette.area : '';
      const sky = this.skySel.value;
      if (!material && !sky) {
        this.say('Pick a ground from the tray, or a weather, first.');
        return;
      }
      if (t.areas.length >= 12) {
        this.say('That is as many areas as a track can have.');
        return;
      }
      this.change(() => {
        t.areas.push({
          x: Math.round(x),
          y: Math.round(y),
          r: Number(this.areaIn.value),
          material,
          sky,
        });
        this.sel = { kind: 'area', index: t.areas.length - 1 };
      });
    } else if (tool === 'bridge') {
      const near = roadAt(t.road.points, x, y);
      if (near.d > t.road.width / 2 + this.reach()) return;
      if (t.bridges.length >= 6) {
        this.say('That is as many bridges as a track can have.');
        return;
      }
      this.change(() => {
        t.bridges.push({
          x: Math.round(x),
          y: Math.round(y),
          length: Number(this.lengthIn.value),
          ...(this.rails ? {} : { rails: false }),
        });
        this.sel = { kind: 'bridge', index: t.bridges.length - 1 };
      });
    } else {
      const material = this.palette.pool;
      if (!this.content.material.has(material)) return;
      if (t.pools.length >= 200) {
        this.say('That is as many pools as a track can hold.');
        return;
      }
      this.change(() => {
        t.pools.push({
          material,
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
    if (this.tool === 'area' || this.tool === 'erase')
      t.areas.forEach((a, i) => {
        const [x, y] = this.toScreen(a.x, a.y);
        const on = this.sel?.kind === 'area' && this.sel.index === i;
        const m = this.content.material.get(a.material);
        g.beginPath();
        g.ellipse(x, y, a.r * v.scale, a.r * v.scale * sq, 0, 0, Math.PI * 2);
        // an area being moved or not yet built shows where its ground will lie
        g.globalAlpha = 0.18;
        g.fillStyle = m?.colour ?? '#9fd0ff';
        g.fill();
        g.globalAlpha = 1;
        g.strokeStyle = on ? '#ff6a3d' : '#fff';
        g.lineWidth = (on ? 3 : 2) * k;
        g.setLineDash([8 * k, 6 * k]);
        g.stroke();
        g.setLineDash([]);
        g.beginPath();
        g.arc(x, y, (on ? 11 : 8) * k, 0, Math.PI * 2);
        g.fillStyle = on ? '#ff6a3d' : '#9fd0ff';
        g.fill();
        g.strokeStyle = '#16141c';
        g.lineWidth = 2.5 * k;
        g.stroke();
        const what = [m?.meta.name.toUpperCase(), a.sky && skyLabel(a.sky)].filter(Boolean);
        this.label(g, what.join(' · '), x, y - 16 * k, k);
      });
    if (this.tool === 'surface' || this.tool === 'raise' || this.tool === 'erase') {
      // stretches of surface: a band along the road in the material's colour
      const T = this.road();
      const band = (a: number, b: number, color: string, on: boolean): void => {
        g.beginPath();
        for (let i = a, first = true; ; i = (i + 1) % T.n, first = false) {
          const [x, y] = this.toScreen(T.x[i]!, T.y[i]!);
          if (first) g.moveTo(x, y);
          else g.lineTo(x, y);
          if (i === b) break;
        }
        g.lineCap = 'butt';
        g.strokeStyle = on ? '#ff6a3d' : '#fff';
        g.lineWidth = Math.max(8 * k, t.road.width * v.scale * sq * 0.5) + 4 * k;
        g.stroke();
        g.strokeStyle = color;
        g.lineWidth = Math.max(8 * k, t.road.width * v.scale * sq * 0.5);
        g.stroke();
        g.lineCap = 'round';
      };
      if (this.tool !== 'surface') {
        // raised stretches: a band along the road, and how high each stands
        t.raised.forEach((up, i) => {
          const a = nearestSample(T, up.x0, up.y0).i;
          const b = nearestSample(T, up.x1, up.y1).i;
          const on = this.sel?.kind === 'raised' && this.sel.index === i;
          band(a, b, '#ffd23d', on);
          const midway = (a + Math.floor(((b - a + T.n) % T.n) / 2)) % T.n;
          const [x, y] = this.toScreen(T.x[midway]!, T.y[midway]!);
          this.label(g, `↑ ${up.height}`, x, y + 4 * k, k);
        });
        const d = this.drag;
        if (this.tool === 'raise' && d?.mode === 'lay' && d.moved) {
          const up = raisedBetween(T, this.height, d.from, d.to);
          band(nearestSample(T, up.x0, up.y0).i, nearestSample(T, up.x1, up.y1).i, '#ffd23d', true);
        }
      }
      if (this.tool !== 'raise')
        t.surfaces.forEach((sf, i) => {
          const a = nearestSample(T, sf.x0, sf.y0).i;
          const b = nearestSample(T, sf.x1, sf.y1).i;
          const m = this.content.material.get(sf.material);
          const on = this.sel?.kind === 'surface' && this.sel.index === i;
          band(a, b, m?.colour ?? '#888', on);
          const midway = (a + Math.floor(((b - a + T.n) % T.n) / 2)) % T.n;
          const [x, y] = this.toScreen(T.x[midway]!, T.y[midway]!);
          this.label(g, (m?.meta.name ?? '').toUpperCase(), x, y + 4 * k, k);
        });
      const d = this.drag;
      if (this.tool === 'surface' && d?.mode === 'lay' && d.moved) {
        const sf = surfaceBetween(T, '', d.from, d.to);
        band(
          nearestSample(T, sf.x0, sf.y0).i,
          nearestSample(T, sf.x1, sf.y1).i,
          this.content.material.get(this.palette.surface)?.colour ?? '#888',
          true,
        );
      }
    }
    if (this.stroke && this.stroke.length > 1) {
      g.beginPath();
      this.stroke.forEach(([px, py], i) => {
        const [x, y] = this.toScreen(px, py);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.strokeStyle = 'rgba(255,210,74,0.35)';
      g.lineWidth = t.road.width * v.scale * sq;
      g.stroke();
      g.strokeStyle = '#fff';
      g.lineWidth = 3 * k;
      g.stroke();
    }
    if (this.tool === 'place' || this.tool === 'erase')
      t.items.forEach((it, i) => {
        const [x, y] = this.toScreen(it.x, it.y);
        const on = this.sel?.kind === 'item' && this.sel.index === i;
        const r = Math.max(
          6 * k,
          (this.content.prop.get(it.prop)?.radius ?? 6) * (it.size ?? 1) * v.scale * 0.9,
        );
        if (on && this.tool === 'place') {
          // the chosen thing: a ring with a round handle to turn it and a square one to resize it
          const h = this.handles(it);
          g.beginPath();
          g.arc(h.x, h.y, h.r, 0, Math.PI * 2);
          g.strokeStyle = 'rgba(255,106,61,0.9)';
          g.lineWidth = 2 * k;
          g.setLineDash([6 * k, 5 * k]);
          g.stroke();
          g.setLineDash([]);
          g.fillStyle = '#ff6a3d';
          g.strokeStyle = '#16141c';
          g.lineWidth = 2.5 * k;
          g.beginPath();
          g.arc(h.turn[0], h.turn[1], 10 * k, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          if (!this.content.prop.get(it.prop)?.critter) {
            g.fillStyle = '#fff';
            g.beginPath();
            g.rect(h.size[0] - 9 * k, h.size[1] - 9 * k, 18 * k, 18 * k);
            g.fill();
            g.stroke();
          }
          this.label(g, '⟳', h.turn[0], h.turn[1] + 4 * k, k);
        }
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

    this.ghost(g, v);

    // what is wrong, or what was just said
    this.noteT = Math.max(0, this.noteT - dt);
    const text = this.problems[0] ?? (this.noteT > 0 ? this.note : '');
    if (text) {
      g.font = `700 ${13 * k}px system-ui, sans-serif`;
      g.textAlign = 'center';
      const w = g.measureText(text).width + 20 * k;
      const y = 104 * k;
      g.fillStyle = this.problems.length ? 'rgba(150,30,20,0.9)' : 'rgba(0,0,0,0.7)';
      g.fillRect(v.w / 2 - w / 2, y - 16 * k, w, 24 * k);
      g.fillStyle = '#fff';
      g.fillText(text, v.w / 2, y);
    }
    g.restore();
  }

  /**
   * What is about to be put down, drawn as itself where it would go: a thing on its way from the
   * tray, one being moved, or (with a mouse) the thing or pool in hand under the pointer.
   */
  private ghost(
    g: CanvasRenderingContext2D,
    v: { w: number; h: number; scale: number; dpr: number },
  ): void {
    const t = this.track!;
    const s = this.s!;
    const d = this.drag;
    const sq = Math.sin(PITCH);
    let thing: {
      prop: string;
      x: number;
      y: number;
      rot: number;
      size?: number | undefined;
    } | null = null;
    const sized = (prop: string): number => (this.content.prop.get(prop)?.critter ? 1 : this.size);
    if (this.carried) {
      const { prop, x, y } = this.carried;
      thing = { prop, x, y, rot: this.rotAt(x, y), size: sized(prop) };
    } else if (d?.changed && d.grab?.kind === 'item') thing = t.items[d.grab.index] ?? null;
    else if (!d && !this.pinch && this.hover && this.tool === 'place') {
      const [x, y] = this.hover;
      const prop = this.palette.prop;
      if (!this.hit(x, y) && !this.sel)
        thing = { prop, x, y, rot: this.rotAt(x, y), size: sized(prop) };
    }
    if (thing) {
      try {
        const R = (this.stacks ??= new StackRenderer(g));
        R.setView(v.scale, PITCH);
        R.begin(s.cam.x, s.cam.y, v.w, v.h);
        R.group(0);
        R.stack(
          this.art.prop(sizedId(thing.prop, thing.size)),
          thing.x,
          thing.y,
          0,
          thing.rot,
          0.8,
        );
        R.flush();
      } catch {
        // a prop with nothing to draw: the ring below still shows where it goes
      }
      const [x, y] = this.toScreen(thing.x, thing.y);
      const r = Math.max(
        6 * v.dpr,
        (this.content.prop.get(thing.prop)?.radius ?? 6) * (thing.size ?? 1) * v.scale,
      );
      g.beginPath();
      g.ellipse(x, y, r, r * sq, 0, 0, Math.PI * 2);
      g.strokeStyle = '#ff6a3d';
      g.lineWidth = 2 * v.dpr;
      g.stroke();
    }
    if (!d && !this.pinch && this.hover && this.tool === 'pool' && !this.hit(...this.hover)) {
      const [x, y] = this.toScreen(...this.hover);
      const r = Number(this.sizeIn.value) * v.scale;
      g.beginPath();
      g.ellipse(x, y, r, r * sq, 0, 0, Math.PI * 2);
      g.globalAlpha = 0.55;
      g.fillStyle = this.content.material.get(this.palette.pool)?.colour ?? '#888';
      g.fill();
      g.globalAlpha = 1;
    }
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
