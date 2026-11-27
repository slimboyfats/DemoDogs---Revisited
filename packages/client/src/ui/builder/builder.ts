import {
  RAISE_MAX,
  RAISE_MIN,
  RAISE_STEP,
  type RaisedEdge,
  type RaisedLanes,
  sizeStep,
  type TrackFile,
} from '@demodogs/shared';
import {
  clampPoint,
  installTrack,
  rangeProp,
  sampleTrack,
  trackProblems,
  type Content,
  type Installed,
  type Track,
} from '@demodogs/sim';
import type { Session } from '../../game/session';
import {
  bridgeEnds,
  bridgeSpan,
  drawRoad,
  History,
  insertPoint,
  joinLevel,
  levelAt,
  levelHeight,
  levelsIn,
  liftTo,
  moveEnd,
  nearest,
  nearestSample,
  RAISE_LEAST,
  raisedAt,
  raisedBetween,
  rampOf,
  removePoint,
  resize,
  reverse,
  roadAt,
  setLevelHeight,
  setRamp,
  slopeLength,
  type Slope,
  snapBridges,
  SNAP_GRID,
  SNAP_POINT,
  snapThing,
  snapTo,
  splitLevel,
  startAt,
  stretchEnds,
  surfaceAt,
  surfaceBetween,
  tidyLevels,
} from '../../game/track-edit';
import { shareTrackLink } from '../../game/tracks';
import type { Art } from '../../render/art';
import { PITCH } from '../../render/scene';
import { Catalogue, type Shelf } from './catalogue';
import { Chrome } from './chrome';
import { paint } from './overlay';

/** What is in hand: each works on one kind of thing, but SELECT (`hand`) and ERASE, on all. */
export type Tool =
  'hand' | 'road' | 'raise' | 'surface' | 'bridge' | 'place' | 'area' | 'pool' | 'erase';

export type Kind = 'point' | 'item' | 'pool' | 'bridge' | 'surface' | 'raised' | 'area';

/** One thing of the track, by its kind and its place in the track's list of them. */
export type Pick = { kind: Kind; index: number };

/**
 * A handle on what is chosen, to drag it into shape by: an end of a stretch of road or of a
 * bridge, the edge of an area or a pool, and a thing's own two (turn it, resize it). `lift` has
 * no handle: it is a finger held on raised road, dragged up or down. A raised stretch's levels
 * and slopes are shaped in the panel, on a picture of it from the side (`Profile`).
 */
export type Grip = 'from' | 'to' | 'lift' | 'edge' | 'turn' | 'size';

/** A handle where it is on the screen (device px); `part`: which level of a raised stretch. */
export type Handle = { grip: Grip; part?: number; x: number; y: number; dx: number; dy: number };

/** What the builder needs of the game around it. */
export interface BuildHooks {
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
  /**
   * The raised stretches of the track have changed and nothing else has: raise and lower the
   * ground of the world on show to match, there and then. False when that cannot be done in
   * place (the world is then built again).
   */
  ground?(t: TrackFile): boolean;
  /** Whether things settle on the grid and the road's lanes, as last chosen on this device. */
  snap?: { get(): boolean; set(on: boolean): void };
}

/** The tool that works on each kind of thing. */
export const TOOL_OF: Record<Kind, Tool> = {
  point: 'road',
  item: 'place',
  pool: 'pool',
  bridge: 'bridge',
  surface: 'surface',
  raised: 'raise',
  area: 'area',
};

/** Whatever a finger can take hold of, the smallest first. */
const ANY: Kind[] = ['item', 'pool', 'bridge', 'point', 'area', 'surface', 'raised'];

/** A finger held still this long on a thing takes hold of it, whatever tool is out (ms). */
const HOLD = 420;
/** How high a stretch of road stands when it is first raised (art px). */
const RAISE_FIRST = 20;
/** The shortest stretch of surface that can be left when its ends are dragged together (px). */
const SURFACE_LEAST = 16;
/** A turn of a thing by a button or a key (radians). */
export const TURN = Math.PI / 12;
/** The most of each kind a track can hold. */
const MOST = { item: 1200, pool: 200, raised: 12, surface: 24, area: 12, bridge: 6, point: 80 };

interface Drag {
  id: number;
  x: number;
  y: number;
  /** Where the finger is now (CSS px). */
  cx: number;
  cy: number;
  moved: boolean;
  /** What the drag does: slides the map, moves what was grabbed, draws, lays, or pulls a handle. */
  mode: 'pan' | 'grab' | 'pencil' | 'lay' | 'grip';
  grip?: Grip;
  part?: number;
  /** A height or a size when the handle was taken, and how far from the thing the finger was. */
  k0?: number;
  dist0?: number;
  grab: Pick | null;
  /** From the finger to the middle of what it holds, so a thing never jumps when taken. */
  off: [number, number];
  changed: boolean;
  touch: boolean;
  /** Where on the ground it began, and where it is now. */
  from: [number, number];
  to: [number, number];
}

/** Give a thing a size (the nearest it can have); its usual size is not written down. */
function setSize(it: TrackFile['items'][number], k: number): void {
  const size = sizeStep(k);
  if (size === 1) delete it.size;
  else it.size = size;
}

/**
 * The level builder (V2 of the track creator): tools down one edge, one panel for whatever is in
 * hand, and the map between them. The road is a loop through points you drag about; stretches of
 * it are raised, surfaced and bridged; things, pools and areas go where you tap. It is made for a
 * thumb first (tap, drag, hold, pinch) and does everything with a mouse and keys as well (a wheel
 * to zoom, the right button to pick, a key for every tool). Every change is saved on the device.
 * What you see is the real world, built from the track by the same rules a race uses. This class
 * is what is done; `Chrome` is the buttons, `paint` the marks over the map. `window.__dd.editor`.
 */
export class LevelBuilder {
  tool: Tool = 'road';
  /** The track being built. */
  track: TrackFile | null = null;
  /** How the next thing put down is turned (radians), and how many times its size. */
  rot = 0;
  size = 1;
  /** How high the next stretch of road to be raised will stand. */
  height = RAISE_FIRST;
  /** Which level of the chosen raised stretch the panel works on (0: its first). */
  part = 0;
  /** Whether the next bridge has rails, and how long it is. */
  rails = true;
  span = 220;
  /** How big the next pool and the next area are, and the next area's weather. */
  poolR = 22;
  areaR = 260;
  sky = '';
  /** What is wrong with the track, if anything (it cannot be raced until it is put right). */
  problems: string[] = [];
  /** What is chosen. */
  sel: Pick | null = null;
  /** The pencil is out: a drag on the map draws the road. */
  pencil = false;
  /** Things settle on a grid, and on the road in its lanes. */
  snap = true;
  /** The chosen thing's catalogue is open, to make it something else. */
  swapping = false;
  drag: Drag | null = null;
  /** The line the pencil has drawn so far. */
  stroke: [number, number][] | null = null;
  /** A thing on its way from the catalogue. */
  carried: { prop: string; x: number; y: number } | null = null;
  /** Where a mouse is over the map (on the ground), and what of the track is under it. */
  hover: [number, number] | null = null;
  over: Pick | null = null;
  /** The ground on show is following the raised road in hand, so no stand-in is drawn for it. */
  lifted = false;
  readonly cat: Catalogue;
  readonly ui: Chrome;
  s: Session | null = null;
  private history = new History();
  private line: Track | null = null;
  /** The whole map is in view as `fit` left it: it is fitted again when the panel comes or goes. */
  private fitted = false;
  private fitAt: [number, number] = [0, 0];
  private hold: ReturnType<typeof setTimeout> | null = null;
  /**
   * A drag has changed the track and the world is yet to be built again from it: that waits for
   * a moment with no finger down, so letting go never stalls on it. (`settled` says it is done.)
   */
  private settling: ReturnType<typeof setTimeout> | null = null;
  /** The raised road in hand has changed since the ground on show was last raised to match. */
  private relift = false;
  /** The fingers on the map, and the two-finger pinch they make. */
  private readonly touches = new Map<number, { x: number; y: number }>();
  pinch: { d: number; cx: number; cy: number } | null = null;
  /** The space bar is down: a drag slides the map, whatever is under it. */
  private space = false;

  constructor(
    root: HTMLElement,
    private readonly tap: HTMLElement,
    readonly content: Content,
    readonly art: Art,
    readonly hooks: BuildHooks,
  ) {
    this.cat = new Catalogue(content, art, {
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
    this.snap = hooks.snap?.get() ?? true;
    this.ui = new Chrome(root, this);
    // the phone was turned: the bars have moved round, so the whole map is found again
    addEventListener('resize', () => {
      if (this.s) setTimeout(() => this.s && this.fit(), 0);
    });
    addEventListener('keydown', (e) => this.key(e));
    addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.space = false;
    });
    tap.addEventListener('pointerdown', (e) => this.press(e));
    tap.addEventListener('pointermove', (e) => this.move(e));
    tap.addEventListener('pointerup', (e) => this.release(e));
    tap.addEventListener('pointercancel', (e) => {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinch = null;
      this.cancel();
    });
    // a finger that slips off the map onto a bar still ends its drag
    tap.addEventListener('lostpointercapture', (e) => {
      if (this.drag?.id === e.pointerId) this.release(e);
    });
    tap.addEventListener('pointerleave', () => {
      this.hover = null;
      this.over = null;
    });
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

  /** Take over a session already built on the track. */
  open(s: Session, t: TrackFile): void {
    const fresh = this.track?.id !== t.id;
    this.track = t;
    this.adopt(s);
    this.line = null;
    this.problems = trackProblems(t);
    this.ui.show(true);
    this.tap.classList.remove('hidden');
    if (fresh) {
      this.history = new History();
      this.sel = null;
      // a track new to the builder opens on the tool that shapes its road
      this.tool = 'road';
      this.pencil = false;
    }
    this.pick(this.tool);
    // the whole map first: where everything is, then pinch in to work
    if (fresh) this.fit();
  }

  close(): void {
    this.s = null;
    this.drag = null;
    this.pinch = null;
    this.stroke = null;
    this.carried = null;
    this.hover = null;
    this.over = null;
    this.unhold();
    if (this.settling !== null) clearTimeout(this.settling);
    this.settling = null;
    this.touches.clear();
    this.ui.show(false);
    this.tap.classList.add('hidden');
  }

  private adopt(s: Session): void {
    this.s = s;
    s.rate = 0;
    s.follow = false;
  }

  /** Take a tool in hand. */
  pick(t: Tool): void {
    const fresh = this.tool !== t;
    this.tool = t;
    if (t !== 'road') this.pencil = false;
    if (this.sel && !this.fits(this.sel)) this.sel = null;
    this.swapping = false;
    this.ui.render();
    if (fresh) this.ui.hint();
    this.refit();
  }

  /** Choose a thing of the track (or nothing), as a tap on it would. */
  select(p: Pick | null): void {
    if (p && !this.fits(p)) this.tool = 'hand';
    this.sel = p;
    this.swapping = false;
    this.ui.render();
  }

  /** Is this kind of thing what the tool in hand works on? */
  private fits(p: Pick): boolean {
    return this.tool === 'erase' || this.tool === 'hand' || TOOL_OF[p.kind] === this.tool;
  }

  /** The tool whose panel is shown: with SELECT, the one that works on what is chosen. */
  get panelTool(): Tool {
    return this.tool === 'hand' && this.sel ? TOOL_OF[this.sel.kind] : this.tool;
  }

  /** The shelf of the catalogue that goes with what is in hand, if any. */
  get shelf(): Shelf {
    const t = this.panelTool;
    if (t === 'place') return this.sel && !this.swapping ? null : 'things';
    return t === 'pool' ? 'pools' : t === 'surface' ? 'surfaces' : t === 'area' ? 'areas' : null;
  }

  /** The chosen thing of each kind, if one of that kind is chosen. */
  get item(): TrackFile['items'][number] | undefined {
    return this.sel?.kind === 'item' ? this.track?.items[this.sel.index] : undefined;
  }
  get up(): TrackFile['raised'][number] | undefined {
    return this.sel?.kind === 'raised' ? this.track?.raised[this.sel.index] : undefined;
  }

  /** Say something for a moment, in the pill under the top bar. */
  say(text: string): void {
    this.ui.say(text);
  }

  // ---- changing the track

  /**
   * Make a change: remember the track as it was, change it, keep it, and build the world again
   * from it. `light` changes are already in the world and skip the build; `later` ones (a key
   * held down) build it in a moment.
   */
  change(edit: () => void, light = false, later = false): void {
    const t = this.track;
    if (!t) return;
    this.history.remember(t);
    edit();
    this.commit(light, later);
  }

  /** How long after a drag is let go the world is built again, if no finger comes down (ms). */
  private static readonly SETTLE = 220;

  /** Whether the world on show is built from the track as it stands (no build is waiting). */
  get settled(): boolean {
    return this.settling === null;
  }

  /** Build the world again soon: once no finger is down, and none has been for a moment. */
  private settleSoon(): void {
    if (this.settling !== null) clearTimeout(this.settling);
    this.settling = setTimeout(() => {
      this.settling = null;
      if (this.drag || this.pinch || this.touches.size) this.settleSoon();
      else this.build();
    }, LevelBuilder.SETTLE);
  }

  /**
   * The ground on show follows the raised road in hand: lifted in place where that can be done
   * (most of the time: a few ms), else the world is built again.
   */
  private reground(): void {
    const t = this.track;
    this.relift = false;
    if (!t || !this.s || this.problems.length) return;
    // (the world must be the track's own but for its raised road: a build that waits comes first)
    if (this.settling !== null) this.build();
    if (this.hooks.ground?.(t)) this.lifted = true;
    else this.build();
  }

  /** `later`: the world is built again in a moment (after a drag), not before this returns. */
  private commit(light = false, later = false): void {
    const t = this.track;
    if (!t) return;
    this.line = null;
    snapBridges(t);
    const sel = this.sel;
    if (sel && !this.thing(sel)) this.sel = null;
    this.problems = trackProblems(t);
    this.hooks.save(t);
    if (later && !light && this.problems.length === 0) this.settleSoon();
    else if (!light) this.build();
    this.ui.render();
  }

  /** The thing a pick names, if it is still there. */
  private thing(p: Pick): unknown {
    const t = this.track!;
    return p.kind === 'point'
      ? t.road.points[p.index]
      : p.kind === 'item'
        ? t.items[p.index]
        : p.kind === 'pool'
          ? t.pools[p.index]
          : p.kind === 'bridge'
            ? t.bridges[p.index]
            : p.kind === 'surface'
              ? t.surfaces[p.index]
              : p.kind === 'raised'
                ? t.raised[p.index]
                : t.areas[p.index];
  }

  /** Build the world again from the track. A road that cannot be raced keeps the old world. */
  private build(): void {
    const t = this.track;
    if (this.settling !== null) clearTimeout(this.settling);
    this.settling = null;
    if (!t || !this.s || this.problems.length) return;
    try {
      this.adopt(this.hooks.rebuild(installTrack(this.content, t)));
    } catch (e) {
      this.say(`That cannot be built: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  get canUndo(): boolean {
    return this.history.size > 0;
  }
  get canRedo(): boolean {
    return this.history.ahead > 0;
  }

  undo(): void {
    const back = this.track && this.history.undo(this.track);
    if (!back) return;
    this.track = back;
    this.sel = null;
    this.commit();
  }

  redo(): void {
    const on = this.track && this.history.redo(this.track);
    if (!on) return;
    this.track = on;
    this.sel = null;
    this.commit();
  }

  /** Give the map a new size, keeping what is on it about its middle. */
  setMapSize(w: number, h: number): void {
    const t = this.track;
    if (!t || !w || !h) return;
    const dx = (w - t.size.w) / 2;
    const dy = (h - t.size.h) / 2;
    this.change(() => resize(t, w, h));
    if (this.s) {
      this.s.cam.x += dx;
      this.s.cam.y += dy;
    }
  }

  /** Put the start line at the chosen point of the road. */
  startHere(): void {
    const sel = this.sel;
    if (sel?.kind !== 'point' || sel.index <= 0) return;
    this.change(() => {
      startAt(this.track!, sel.index);
      this.sel = { kind: 'point', index: 0 };
    });
  }

  /** Race the other way round. */
  reverse(): void {
    const t = this.track;
    if (t) this.change(() => (reverse(t), (this.sel = null)));
  }

  /** Turn the chosen thing, or the next one put down. */
  turn(by: number): void {
    const it = this.item;
    if (it) this.change(() => (it.rot += by), false, true);
    else {
      this.rot += by;
      this.ui.render();
    }
  }

  /** Make the chosen thing, or the next one put down, a step bigger or smaller. */
  resizeBy(by: number): void {
    const it = this.item;
    if (it) this.change(() => setSize(it, (it.size ?? 1) + by));
    else {
      this.size = sizeStep(this.size + by);
      this.ui.render();
    }
  }

  /** Another of the chosen thing, a little to one side, chosen in its place. */
  copy(): void {
    const t = this.track;
    const it = this.item;
    if (!t || !it) return;
    if (t.items.length >= MOST.item) {
      this.say('That is as many things as a track can hold.');
      return;
    }
    const step = Math.max(
      SNAP_GRID,
      (this.content.prop.get(it.prop)?.radius ?? 6) * (it.size ?? 1) * 2 + 4,
    );
    // along the way it faces is where a row of them goes; back inside the map if that is off it
    let x = it.x + Math.cos(it.rot + Math.PI / 2) * step;
    let y = it.y + Math.sin(it.rot + Math.PI / 2) * step;
    x = Math.round(Math.max(14, Math.min(t.size.w - 14, x)));
    y = Math.round(Math.max(14, Math.min(t.size.h - 14, y)));
    this.change(() => {
      t.items.push({ ...it, x, y });
      this.sel = { kind: 'item', index: t.items.length - 1 };
    });
  }

  /** Raise the level in hand of the chosen stretch, or the next stretch to be laid, by this much. */
  raiseBy(by: number): void {
    const step = (v: number): number => Math.max(RAISE_MIN, Math.min(RAISE_MAX, v + by));
    const up = this.up;
    if (up) {
      const part = Math.min(this.part, up.levels?.length ?? 0);
      const to = step(levelHeight(up, part));
      if (to !== levelHeight(up, part)) this.change(() => setLevelHeight(up, part, to));
    } else {
      this.height = step(this.height);
      this.ui.render();
    }
  }

  /** Split the level in hand of the chosen raised stretch in two: one more height to set. */
  split(): void {
    const t = this.track;
    const up = this.up;
    if (!t || !up) return;
    const tried = structuredClone(up);
    const part = splitLevel(this.road(), tried, Math.min(this.part, up.levels?.length ?? 0));
    if (part < 0) {
      this.say('No room for another level here. Drag an end to make the stretch longer.');
      return;
    }
    const index = this.sel!.index;
    this.change(() => {
      t.raised[index] = tried;
      this.part = part;
    });
    this.say('Each level has a height of its own: drag them on the picture in the panel.');
  }

  /** Join the level in hand of the chosen raised stretch to the one beside it. */
  join(): void {
    const up = this.up;
    if (!up?.levels?.length) return;
    this.change(() => {
      const part = joinLevel(up, Math.min(this.part, up.levels?.length ?? 0));
      if (part >= 0) this.part = part;
    });
  }

  /** What stands along the chosen raised stretch's edges. */
  setEdge(edge: RaisedEdge): void {
    const up = this.up;
    if (!up) return;
    this.change(() => {
      if (edge === 'rail') delete up.edge;
      else up.edge = edge;
    });
  }

  /** Which sides of the chosen raised stretch have ramps back up to it. */
  setLanes(lanes: RaisedLanes): void {
    const up = this.up;
    if (!up) return;
    this.change(() => {
      if (lanes === 'both') delete up.lanes;
      else up.lanes = lanes;
    });
  }

  /** Give an end of the chosen raised stretch (0: the way up, 1: the way down) a slope by name. */
  setSlope(end: 0 | 1, slope: Slope): void {
    const t = this.track;
    const up = this.up;
    if (!t || !up) return;
    const tried = structuredClone(up);
    const { heights } = levelsIn(this.road(), up);
    const h = end === 0 ? heights[0]! : heights[heights.length - 1]!;
    if (!setRamp(this.road(), tried, end, slopeLength(h, slope))) {
      if (rampOf(this.road(), up, end) < slopeLength(h, slope))
        this.say('No room for a longer slope. Drag an end to make the stretch longer.');
      return;
    }
    const index = this.sel!.index;
    this.change(() => (t.raised[index] = tried));
  }

  /** A drag in the panel is shaping the chosen raised stretch, and has changed it. */
  private shaping = false;

  /**
   * Change the chosen raised stretch as a drag in the panel goes: `edit` is given a copy and the
   * road, and says whether it changed it. The ground on show follows there and then; the world
   * is built again after `shaped`, when the drag is let go.
   */
  shape(edit: (up: TrackFile['raised'][number], T: Track) => boolean): boolean {
    const t = this.track;
    const sel = this.sel;
    const up = this.up;
    if (!t || !sel || !up) return false;
    const tried = structuredClone(up);
    if (!edit(tried, this.road())) return false;
    if (!this.shaping) this.history.remember(t);
    this.shaping = true;
    t.raised[sel.index] = tried;
    this.relift = true;
    this.ui.render();
    return true;
  }

  shaped(): void {
    if (!this.shaping) return;
    this.shaping = false;
    this.lifted = false;
    this.commit(false, true);
  }

  /** Make the chosen raised stretch longer or shorter at one end, by about `by` px. */
  stretch(end: 0 | 1, by: number): void {
    const did = this.shape((up, T) => {
      const had = up.levels?.length ?? 0;
      const i = stretchEnds(T, up)[end];
      const j = (i + (end === 0 ? -1 : 1) * Math.round(by / T.step) + T.n) % T.n;
      if (!moveEnd(T, up, end, T.x[j]!, T.y[j]!, RAISE_LEAST)) return false;
      // an end stops short of the level nearest it: it does not swallow it
      tidyLevels(T, up);
      return (up.levels?.length ?? 0) === had;
    });
    if (did) this.shaped();
    else this.say(by > 0 ? 'No more room that way.' : 'It cannot be any shorter there.');
  }

  /** Take the chosen thing (or the one named) away. */
  erase(p: Pick | null = this.sel): void {
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
      this.over = null;
    });
  }

  testDrive(): void {
    if (this.track && this.problems.length === 0) this.hooks.drive(this.track);
    else if (this.problems.length) this.say(this.problems[0]!);
  }

  /** Hand the track over as a link. */
  async share(): Promise<string> {
    if (!this.track) return '';
    const did = await shareTrackLink(this.track);
    const said =
      did === 'copied'
        ? 'A link to this track is copied: paste it to a friend.'
        : did === 'failed'
          ? 'The link could not be shared here. Save it as a file instead.'
          : '';
    if (said) this.say(said);
    return said;
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

  /** Whether things line up as they are put down and moved. */
  setSnap(on: boolean): void {
    this.snap = on;
    this.hooks.snap?.set(on);
    this.ui.render();
    this.say(on ? 'Snap is on: things line up.' : 'Snap is off: things go anywhere.');
  }

  /** Take the pencil out, or put it away. */
  setPencil(on: boolean): void {
    if (on && this.tool !== 'road') this.pick('road');
    this.pencil = on;
    if (on) this.sel = null;
    this.ui.render();
    this.ui.hint();
  }

  // ---- where things are

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
  toScreen(x: number, y: number): [number, number] {
    const v = this.hooks.view();
    const s = this.s!;
    return [(x - s.cam.x) * v.scale + v.w / 2, (y - s.cam.y) * v.scale * Math.sin(PITCH) + v.h / 2];
  }

  /**
   * How far a finger reaches, in art px. Road points are few and far apart, so a near miss still
   * takes one; things stand close together, and a tap beside one must put another down.
   */
  private reach(kind: Kind = 'point'): number {
    const v = this.hooks.view();
    const few = kind === 'point' || kind === 'bridge' || kind === 'area';
    return Math.max(8, ((few ? 28 : 16) * v.dpr) / v.scale);
  }

  /** What of the track is under (x, y) that the tool in hand works on (or of these kinds). */
  hit(x: number, y: number, kinds?: Kind[]): Pick | null {
    const t = this.track!;
    const mine = (Object.keys(TOOL_OF) as Kind[]).filter((k) => TOOL_OF[k] === this.tool);
    const tries = kinds ?? (this.tool === 'erase' || this.tool === 'hand' ? ANY : mine);
    for (const kind of tries) {
      if (kind === 'surface' || kind === 'raised') {
        const reach = t.road.width / 2 + this.reach('item');
        const index =
          kind === 'surface'
            ? surfaceAt(this.road(), t, x, y, reach)
            : raisedAt(this.road(), t, x, y, reach);
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
  road(): Track {
    return (this.line ??= sampleTrack(this.track!.road.points, 4));
  }

  /** How a thing put down at (x, y) is turned: along the road if it is on it. */
  rotAt(x: number, y: number): number {
    const t = this.track!;
    const T = this.road();
    const near = nearestSample(T, x, y);
    return (near.d < t.road.width / 2 ? T.a[near.i]! : 0) + this.rot;
  }

  /** The ring round the chosen thing that its two handles sit on (device px). */
  ring(it: TrackFile['items'][number]): { x: number; y: number; r: number } {
    const v = this.hooks.view();
    const [x, y] = this.toScreen(it.x, it.y);
    const radius = (this.content.prop.get(it.prop)?.radius ?? 6) * (it.size ?? 1);
    return { x, y, r: Math.max(42 * v.dpr, radius * v.scale + 24 * v.dpr) };
  }

  /**
   * The handles of whatever is chosen, where they are on the screen (device px). `dx`, `dy` is
   * the way an end's arrows point; for a tab or a slope's handle, the place on the road it is
   * tied to; for a thing's, the thing itself.
   */
  grips(): Handle[] {
    const t = this.track;
    const sel = this.sel;
    if (!t || !sel || !this.s || this.tool === 'erase') return [];
    const v = this.hooks.view();
    const k = v.dpr;
    const sq = Math.sin(PITCH);
    const out: Handle[] = [];
    if (sel.kind === 'item') {
      const it = t.items[sel.index];
      if (!it) return [];
      const { x, y, r } = this.ring(it);
      const ax = Math.cos(it.rot);
      const ay = Math.sin(it.rot) * sq;
      const al = Math.hypot(ax, ay) || 1;
      const turn = { grip: 'turn' as const, x: x + (ax / al) * r, y: y + (ay / al) * r };
      out.push({ ...turn, dx: x, dy: y });
      if (!this.content.prop.get(it.prop)?.critter) {
        // the square one keeps out of the round one's way
        const d = r * Math.SQRT1_2;
        const right = Math.hypot(turn.x - (x + d), turn.y - (y + d)) > 44 * k;
        out.push({ grip: 'size', x: right ? x + d : x - d, y: y + d, dx: x, dy: y });
      }
      return out;
    }
    if (sel.kind === 'area' || sel.kind === 'pool') {
      const o = sel.kind === 'area' ? t.areas[sel.index] : t.pools[sel.index];
      if (!o) return [];
      const [x, y] = this.toScreen(o.x, o.y);
      // (a small pool's handle stands clear of its middle, which is what moves it)
      out.push({ grip: 'edge', x: x + Math.max(o.r * v.scale, 34 * k), y, dx: 1, dy: 0 });
      return out;
    }
    if (sel.kind === 'point') return [];
    const T = this.road();
    const s =
      sel.kind === 'raised'
        ? t.raised[sel.index]
        : sel.kind === 'surface'
          ? t.surfaces[sel.index]
          : undefined;
    const b = sel.kind === 'bridge' ? t.bridges[sel.index] : undefined;
    const ends = s ? stretchEnds(T, s) : b ? bridgeEnds(T, b) : null;
    if (!ends) return [];
    const along = (i: number): [number, number] => {
      const ax = Math.cos(T.a[i]!);
      const ay = Math.sin(T.a[i]!) * sq;
      const al = Math.hypot(ax, ay) || 1;
      return [ax / al, ay / al];
    };
    ends.forEach((i, e) => {
      const [x, y] = this.toScreen(T.x[i]!, T.y[i]!);
      const [dx, dy] = along(i);
      out.push({ grip: e === 0 ? 'from' : 'to', x, y, dx, dy });
    });
    return out;
  }

  /** The handle under a point of the screen (CSS px), if one of the chosen thing's is there. */
  gripAt(cx: number, cy: number): Handle | null {
    const k = this.hooks.view().dpr;
    let best: Handle | null = null;
    let bd = 26 * k;
    for (const g of this.grips()) {
      const d = Math.hypot(cx * k - g.x, cy * k - g.y);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    return best;
  }

  // ---- the view: sliding and zooming

  slide(dx: number, dy: number): void {
    const s = this.s;
    const t = this.track;
    if (!s || !t) return;
    const v = this.hooks.view();
    s.cam.x = Math.max(0, Math.min(t.size.w, s.cam.x - (dx * v.dpr) / v.scale));
    s.cam.y = Math.max(0, Math.min(t.size.h, s.cam.y - (dy * v.dpr) / (v.scale * Math.sin(PITCH))));
    if (dx || dy) this.fitted = false;
  }

  /** Zoom by a factor, keeping the ground under a point of the screen (CSS px) where it is. */
  zoomAt(cx: number, cy: number, by: number): void {
    if (!this.s || !this.track) return;
    const [lo, hi] = this.hooks.zoomRange();
    const now = this.hooks.view().scale;
    const k = Math.max(lo, Math.min(hi, now * by));
    if (k === now) return;
    this.fitted = false;
    const [x, y] = this.toWorld(cx, cy);
    this.hooks.setZoom(k);
    const [nx, ny] = this.toWorld(cx, cy);
    this.s.cam.x += x - nx;
    this.s.cam.y += y - ny;
    this.slide(0, 0);
  }

  zoomBy(by: number): void {
    const f = this.ui.free();
    this.zoomAt((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, by);
  }

  /** The whole map on the screen, in the part of it the bars and the panel leave clear. */
  fit(): void {
    const t = this.track;
    const s = this.s;
    if (!t || !s) return;
    const v = this.hooks.view();
    const f = this.ui.free();
    const sq = Math.sin(PITCH);
    const [lo, hi] = this.hooks.zoomRange();
    const room = 0.94 * v.dpr;
    const k = Math.max(
      lo,
      Math.min(hi, ((f.x1 - f.x0) * room) / t.size.w, ((f.y1 - f.y0) * room) / (t.size.h * sq)),
    );
    this.hooks.setZoom(k);
    // the middle of the map in the middle of the clear part, which is not the screen's
    s.cam.x = t.size.w / 2 - (((f.x0 + f.x1) / 2) * v.dpr - v.w / 2) / k;
    s.cam.y = t.size.h / 2 - (((f.y0 + f.y1) / 2) * v.dpr - v.h / 2) / (k * sq);
    this.slide(0, 0);
    this.fitted = true;
    this.fitAt = [s.cam.x, s.cam.y];
  }

  /** The panel came or went: the whole map, if that is what was on show, is found again. */
  refit(): void {
    // (never under a finger, and never once the map has been slid away from where `fit` left it)
    const s = this.s;
    if (!this.fitted || this.drag || this.pinch || !s) return;
    if (Math.abs(s.cam.x - this.fitAt[0]) > 1 || Math.abs(s.cam.y - this.fitAt[1]) > 1) {
      this.fitted = false;
      return;
    }
    this.fit();
  }

  // ---- fingers, a mouse and keys

  /** How far apart the two fingers are, and the point midway between them (CSS px). */
  private twoFingers(): { d: number; cx: number; cy: number } {
    const [a, b] = [...this.touches.values()] as [
      { x: number; y: number },
      { x: number; y: number },
    ];
    return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  /** From a point on the ground to the middle of a thing, so it can be dragged by its edge. */
  private offTo(p: Pick, x: number, y: number): [number, number] {
    const t = this.track!;
    if (p.kind === 'point') {
      const q = t.road.points[p.index]!;
      return [q[0] - x, q[1] - y];
    }
    const o =
      p.kind === 'item'
        ? t.items[p.index]
        : p.kind === 'area'
          ? t.areas[p.index]
          : t.pools[p.index];
    return o && p.kind !== 'bridge' ? [o.x - x, o.y - y] : [0, 0];
  }

  private unhold(): void {
    if (this.hold !== null) clearTimeout(this.hold);
    this.hold = null;
  }

  /**
   * The finger has rested on one spot: whatever is under it is taken in hand, to be dragged off
   * there and then, whichever tool was out. The quick way to move one thing while doing another.
   */
  private held(id: number): void {
    this.hold = null;
    const d = this.drag;
    if (!d || d.id !== id || d.moved || this.pinch) return;
    if (d.mode !== 'pan' && d.mode !== 'lay') return;
    const [x, y] = d.from;
    const p = d.mode === 'lay' ? null : this.hit(x, y, ANY);
    if (!p || p.kind === 'surface' || p.kind === 'raised') {
      this.heldRoad(x, y);
      return;
    }
    if (!this.fits(p)) this.tool = 'hand';
    this.stroke = null;
    this.sel = p;
    this.swapping = false;
    Object.assign(d, { mode: 'grab', grab: p, off: this.offTo(p, x, y) });
    this.ui.render();
    navigator.vibrate?.(12);
  }

  /**
   * A finger has rested on raised road: it has hold of it, and up or down the screen from there
   * lifts or lowers it. With RAISE out, a finger resting on plain road raises a stretch to lift.
   */
  private heldRoad(x: number, y: number): void {
    const t = this.track;
    const d = this.drag;
    if (!t || !d) return;
    const T = this.road();
    const reach = t.road.width / 2 + this.reach('item');
    let index = raisedAt(T, t, x, y, reach);
    if (index < 0) {
      const near = nearestSample(T, x, y);
      if (this.tool !== 'raise' || near.d > reach || t.raised.length >= MOST.raised) return;
      this.history.remember(t);
      t.raised.push(raisedBetween(T, this.height, [x, y], [x, y]));
      d.changed = true;
      this.relift = true;
      index = t.raised.length - 1;
    }
    if (this.tool !== 'raise' && this.tool !== 'hand') this.tool = 'raise';
    this.sel = { kind: 'raised', index };
    // (the level under the finger is the one that is lifted)
    const part = levelAt(T, t.raised[index]!, x, y);
    this.part = part;
    const k0 = levelHeight(t.raised[index]!, part);
    Object.assign(d, { mode: 'grip', grip: 'lift', part, grab: this.sel, k0 });
    this.ui.render();
    this.say('Drag up to lift it, down to lower it.');
    navigator.vibrate?.(12);
  }

  private press(e: PointerEvent): void {
    e.preventDefault();
    // (keys are the map's again, not a box's in the panel)
    const box = document.activeElement;
    if (box instanceof HTMLElement && box !== document.body) box.blur();
    const t = this.track;
    if (!this.s || !t) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.tap.setPointerCapture(e.pointerId);
    if (this.touches.size === 2) {
      // a second finger: whatever the first was doing, the two of them now pinch and slide
      this.cancel();
      this.pinch = this.twoFingers();
      return;
    }
    if (this.touches.size > 2 || this.drag) return;
    const at = this.toWorld(e.clientX, e.clientY);
    const [x, y] = at;
    const drag: Drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      cx: e.clientX,
      cy: e.clientY,
      moved: false,
      changed: false,
      touch: e.pointerType !== 'mouse',
      mode: 'pan',
      grab: null,
      off: [0, 0],
      from: at,
      to: at,
    };
    this.drag = drag;
    // the right button picks whatever is under it, whichever tool is out; it, the middle button
    // and the space bar slide the map
    if (e.button === 2) {
      const p = this.hit(x, y, ANY);
      if (p?.kind === 'raised') this.part = levelAt(this.road(), t.raised[p.index]!, x, y);
      this.select(p);
    }
    if (e.button === 1 || e.button === 2 || this.space) {
      this.tap.style.cursor = 'grabbing';
      return;
    }
    // a handle of what is chosen comes before anything under it
    const g = this.pencil ? null : this.gripAt(e.clientX, e.clientY);
    if (g && this.sel) {
      const sel = this.sel;
      const up = this.up;
      const it = this.item;
      if (up && g.part !== undefined && this.part !== g.part) {
        this.part = g.part;
        this.ui.render();
      }
      Object.assign(drag, { mode: 'grip', grip: g.grip, grab: sel });
      drag.k0 = up ? levelHeight(up, g.part ?? 0) : (it?.size ?? 1);
      if (g.part !== undefined) drag.part = g.part;
      if (it) {
        const k = this.hooks.view().dpr;
        drag.dist0 = Math.hypot(e.clientX * k - g.dx, e.clientY * k - g.dy) || 1;
      }
      this.tap.style.cursor = 'grabbing';
      return;
    }
    if (this.tool === 'road' && this.pencil) {
      drag.mode = 'pencil';
      this.stroke = [at];
      return;
    }
    if (this.tool === 'surface' || this.tool === 'raise') {
      if (nearestSample(this.road(), x, y).d <= t.road.width / 2 + this.reach('item'))
        drag.mode = 'lay';
    } else if (this.tool !== 'erase') {
      let grab = this.hit(x, y);
      // a stretch of road is chosen by a tap; a drag over it slides the map
      if (grab?.kind === 'surface' || grab?.kind === 'raised') grab = null;
      if (grab) {
        Object.assign(drag, { mode: 'grab', grab, off: this.offTo(grab, x, y) });
        this.sel = grab;
        this.swapping = false;
        this.ui.render();
        return;
      }
    }
    if (drag.mode === 'pan' || this.tool === 'raise') {
      // (a finger laying a surface or drawing is already at work: it is never taken for a hold;
      // one resting on the road with RAISE out lifts it)
      this.unhold();
      this.hold = setTimeout(() => this.held(e.pointerId), HOLD);
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
      const now = this.twoFingers();
      this.slide(now.cx - this.pinch.cx, now.cy - this.pinch.cy);
      this.zoomAt(now.cx, now.cy, now.d / this.pinch.d);
      this.pinch = now;
      return;
    }
    const d = this.drag;
    if (!d) {
      // a mouse over the map shows what a click would take, or put down
      if (e.pointerType === 'mouse') this.point(e.clientX, e.clientY);
      return;
    }
    if (d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    // a fingertip is never quite still: it has to mean it
    if (!d.moved && Math.hypot(dx, dy) < (d.touch ? 10 : 6)) return;
    d.moved = true;
    this.unhold();
    d.cx = e.clientX;
    d.cy = e.clientY;
    if (d.mode === 'pan') {
      // nothing in hand: the map slides under the finger
      this.slide(dx, dy);
      d.x = e.clientX;
      d.y = e.clientY;
      return;
    }
    this.dragTo(e.clientX, e.clientY);
  }

  /** A mouse rests over a point of the screen: what is under it, and the pointer that says so. */
  private point(cx: number, cy: number): void {
    this.hover = this.toWorld(cx, cy);
    const grip = this.pencil ? undefined : this.gripAt(cx, cy)?.grip;
    this.over = grip || this.pencil ? null : this.hit(...this.hover);
    const road = this.over?.kind === 'surface' || this.over?.kind === 'raised';
    this.tap.style.cursor = this.space
      ? 'grab'
      : grip === 'lift'
        ? 'ns-resize'
        : grip
          ? 'grab'
          : this.over
            ? this.tool === 'erase' || road
              ? 'pointer'
              : 'move'
            : this.tool === 'hand' || this.tool === 'erase'
              ? 'default'
              : 'crosshair';
  }

  /** What is in hand follows the finger to a point of the screen (CSS px). */
  private dragTo(cx: number, cy: number): void {
    const d = this.drag;
    const t = this.track;
    if (!d || !t) return;
    const [fx, fy] = this.toWorld(cx, cy);
    d.to = [fx, fy];
    if (d.mode === 'pencil') {
      const last = this.stroke?.[this.stroke.length - 1];
      if (last && Math.hypot(fx - last[0], fy - last[1]) >= 6) this.stroke!.push([fx, fy]);
      return;
    }
    if (d.mode === 'lay' || d.mode === 'pan' || !d.grab) return;
    const g = d.grab;
    const before = (): void => {
      if (!d.changed) this.history.remember(t);
      d.changed = true;
    };
    if (d.mode === 'grip' && (d.grip === 'turn' || d.grip === 'size')) {
      const it = t.items[g.index];
      if (!it) return;
      const v = this.hooks.view();
      const [ix, iy] = this.toScreen(it.x, it.y);
      const px = cx * v.dpr - ix;
      const py = cy * v.dpr - iy;
      before();
      if (d.grip === 'turn')
        // it faces the finger, in steps
        it.rot = Math.round(Math.atan2(py / Math.sin(PITCH), px) / TURN) * TURN;
      else setSize(it, (d.k0 ?? 1) * (Math.hypot(px, py) / (d.dist0 ?? 1)));
      return;
    }
    if (d.mode === 'grip') {
      this.gripTo(fx, fy, cy - d.y, before);
      return;
    }
    before();
    const x = fx + d.off[0];
    const y = fy + d.off[1];
    if (g.kind === 'point') {
      t.road.points[g.index] = this.snap
        ? clampPoint(t, snapTo(x, SNAP_POINT), snapTo(y, SNAP_POINT))
        : clampPoint(t, x, y);
      this.line = null;
    } else if (g.kind === 'bridge') {
      // a bridge slides along the road, wherever the finger wanders
      const T = this.road();
      const i = nearestSample(T, fx, fy).i;
      Object.assign(t.bridges[g.index]!, { x: Math.round(T.x[i]!), y: Math.round(T.y[i]!) });
    } else if (g.kind !== 'surface' && g.kind !== 'raised') {
      const o =
        g.kind === 'item'
          ? t.items[g.index]!
          : g.kind === 'area'
            ? t.areas[g.index]!
            : t.pools[g.index]!;
      const [sx, sy] = this.settle(g.kind, x, y);
      o.x = Math.round(Math.max(12, Math.min(t.size.w - 12, sx)));
      o.y = Math.round(Math.max(12, Math.min(t.size.h - 12, sy)));
    }
  }

  /**
   * The handle in hand follows the finger: to (x, y) on the ground, `dy` CSS px down the screen
   * from where it was taken. The world is built again when it is let go, not on the way.
   */
  private gripTo(x: number, y: number, dy: number, before: () => void): void {
    const d = this.drag;
    const t = this.track;
    const g = d?.grab;
    if (!d || !t || !g) return;
    const T = this.road();
    if (g.kind === 'raised' || g.kind === 'surface') {
      const s = g.kind === 'raised' ? t.raised[g.index] : t.surfaces[g.index];
      if (!s) return;
      const up = g.kind === 'raised' ? t.raised[g.index] : undefined;
      if (up && d.grip === 'lift') {
        const part = d.part ?? 0;
        const to = liftTo(d.k0 ?? levelHeight(up, part), dy);
        if (to === levelHeight(up, part)) return;
        before();
        setLevelHeight(up, part, to);
        this.height = to;
        this.relift = true;
        this.ui.render();
        return;
      }
      // (the track as it was is remembered before the end is moved, so a copy is tried first)
      const tried = structuredClone(s);
      const least = g.kind === 'raised' ? RAISE_LEAST : SURFACE_LEAST;
      if (!moveEnd(T, tried, d.grip === 'from' ? 0 : 1, x, y, least)) return;
      if (up?.levels) {
        // an end stops short of the level nearest it: it does not swallow it
        const had = up.levels.length;
        tidyLevels(T, tried as typeof up);
        if (((tried as typeof up).levels?.length ?? 0) !== had) return;
      }
      before();
      Object.assign(s, tried);
      if (g.kind === 'raised') this.relift = true;
    } else if (g.kind === 'bridge') {
      const b = t.bridges[g.index];
      if (!b) return;
      const length = bridgeSpan(T, b, x, y);
      if (length === b.length) return;
      before();
      b.length = length;
      this.ui.render();
    } else if (g.kind === 'area' || g.kind === 'pool') {
      const o = g.kind === 'area' ? t.areas[g.index] : t.pools[g.index];
      if (!o) return;
      // the edge goes where the finger is: as far from the middle as it is
      const [lo, hi, step] = g.kind === 'area' ? [40, 700, 10] : [4, 80, 2];
      const r = Math.max(lo, Math.min(hi, snapTo(Math.hypot(x - o.x, y - o.y), step)));
      if (r === o.r) return;
      before();
      o.r = r;
      this.ui.render();
    }
  }

  /** Where something let go at (x, y) comes to rest: on the grid or in a lane, if snap is on. */
  private settle(kind: Kind, x: number, y: number): [number, number] {
    if (!this.snap) return [x, y];
    return kind === 'item'
      ? snapThing(this.road(), this.track!.road.width, x, y)
      : [snapTo(x, SNAP_GRID), snapTo(y, SNAP_GRID)];
  }

  /**
   * A thing dragged to the edge of the open map drags the map along with it, so a long move
   * across a small screen is one drag and not three.
   */
  private creep(dt: number): void {
    const d = this.drag;
    if (!d?.moved || this.pinch || d.mode === 'pan') return;
    // (these go by how far the finger has moved on the screen: the map must stay put)
    if (d.grip === 'lift' || d.grip === 'turn' || d.grip === 'size') return;
    const f = this.ui.free();
    const edge = 30;
    const vx = d.cx < f.x0 + edge ? 1 : d.cx > f.x1 - edge ? -1 : 0;
    const vy = d.cy < f.y0 + edge ? 1 : d.cy > f.y1 - edge ? -1 : 0;
    if (!vx && !vy) return;
    const by = 320 * Math.min(0.05, dt);
    this.slide(vx * by, vy * by);
    this.dragTo(d.cx, d.cy);
  }

  private release(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    this.unhold();
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
    this.tap.style.cursor = '';
    this.lifted = false;
    if (e.button === 1 || e.button === 2) return;
    if (d.mode === 'pencil') {
      if (stroke) this.drawn(stroke);
    } else if (d.mode === 'lay' && d.moved) this.lay(d.from, d.to);
    else if (d.changed) this.commit(false, true);
    else if (!d.moved && d.mode !== 'grip' && !this.space) this.use(...d.from);
    if (e.pointerType === 'mouse') this.point(e.clientX, e.clientY);
  }

  private cancel(): void {
    const d = this.drag;
    this.drag = null;
    this.stroke = null;
    this.unhold();
    this.lifted = false;
    if (d?.changed) this.commit(false, true);
  }

  /** A key was pressed with the builder open and no box being typed in. */
  private key(e: KeyboardEvent): void {
    if (!this.s || !this.track || this.ui.sheetOpen) {
      if (this.s && e.key === 'Escape' && this.ui.sheetOpen) this.ui.closeSheet();
      return;
    }
    const box = e.target as HTMLElement | null;
    if (box?.matches?.('input, select, textarea')) {
      if (e.key === 'Escape') box.blur();
      return;
    }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const mod = e.ctrlKey || e.metaKey;
    const far = e.shiftKey ? 4 : 1;
    const sel = this.sel;
    let done = true;
    if (mod && k === 'z') {
      if (e.shiftKey) this.redo();
      else this.undo();
    } else if (mod && k === 'y') this.redo();
    else if (mod && k === 'd') this.copy();
    else if (mod || e.altKey) done = false;
    else if (e.code === 'Space') this.space = true;
    else if (k === 'Delete' || k === 'Backspace') this.erase();
    else if (k === 'Escape') {
      if (this.pencil) this.setPencil(false);
      else if (sel) this.select(null);
      else if (this.tool !== 'hand') this.pick('hand');
    } else if (k === 'Enter') this.testDrive();
    else if (k === 'Tab') this.ui.shut(!this.ui.isShut);
    else if (k === '+' || k === '=') this.zoomBy(1.5);
    else if (k === '-' || k === '_') this.zoomBy(1 / 1.5);
    else if (k === '0' || k === 'f') this.fit();
    else if (k === 'm') this.setSnap(!this.snap);
    else if (k === 'd' && this.tool === 'road') this.setPencil(!this.pencil);
    else if (k === '?' || k === '/') this.ui.openKeys();
    else if (k === '[' || k === 'q') this.turn(-TURN);
    else if (k === ']' || k === 'e') this.turn(TURN);
    else if (k === ',' && (this.item || this.tool === 'place')) this.resizeBy(-0.25);
    else if (k === '.' && (this.item || this.tool === 'place')) this.resizeBy(0.25);
    else if (k.startsWith('Arrow')) {
      const dx = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0;
      const dy = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0;
      if (!sel) this.slide(-dx * 48 * far, -dy * 48 * far);
      else if (sel.kind === 'raised') {
        if (dy) this.raiseBy(-dy * RAISE_STEP);
        else this.stepPart(dx);
      } else this.nudge(dx * 4 * far, dy * 4 * far);
    } else {
      const tool = this.ui.toolFor(k);
      if (tool) this.pick(tool);
      else done = false;
    }
    if (done) e.preventDefault();
  }

  /** The next or the last level of the chosen raised stretch is the one in hand. */
  stepPart(by: number): void {
    const n = this.up?.levels?.length ?? 0;
    const to = Math.max(0, Math.min(n, this.part + by));
    if (to === this.part) return;
    this.part = to;
    this.ui.render();
  }

  /** Move what is chosen a little way (art px): the arrow keys. */
  private nudge(dx: number, dy: number): void {
    const t = this.track;
    const sel = this.sel;
    if (!t || !sel) return;
    if (sel.kind === 'point') {
      const [x, y] = t.road.points[sel.index]!;
      this.change(() => (t.road.points[sel.index] = clampPoint(t, x + dx, y + dy)), false, true);
    } else if (sel.kind === 'bridge') {
      // a bridge keeps to the road: along it, the way the arrow points
      const T = this.road();
      const b = t.bridges[sel.index]!;
      const i = nearestSample(T, b.x, b.y).i;
      const way = Math.cos(T.a[i]!) * dx + Math.sin(T.a[i]!) * dy >= 0 ? 1 : -1;
      const j = (i + way * Math.max(1, Math.round(Math.hypot(dx, dy) / T.step)) + T.n) % T.n;
      this.change(
        () => Object.assign(b, { x: Math.round(T.x[j]!), y: Math.round(T.y[j]!) }),
        false,
        true,
      );
    } else if (sel.kind === 'item' || sel.kind === 'pool' || sel.kind === 'area') {
      const o =
        sel.kind === 'item'
          ? t.items[sel.index]!
          : sel.kind === 'pool'
            ? t.pools[sel.index]!
            : t.areas[sel.index]!;
      this.change(
        () => {
          o.x = Math.round(Math.max(12, Math.min(t.size.w - 12, o.x + dx)));
          o.y = Math.round(Math.max(12, Math.min(t.size.h - 12, o.y + dy)));
        },
        false,
        true,
      );
    }
  }

  // ---- what a tap does

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

  /** Raise, or lay the surface in hand, along the road between two points on the ground. */
  lay(p: readonly [number, number], q: readonly [number, number]): void {
    const t = this.track!;
    if (this.tool === 'raise') {
      if (t.raised.length >= MOST.raised) {
        this.say('That is as many raised stretches as a track can have.');
        return;
      }
      this.change(() => {
        t.raised.push(raisedBetween(this.road(), this.height, p, q));
        this.sel = { kind: 'raised', index: t.raised.length - 1 };
        this.part = 0;
      });
      return;
    }
    const material = this.cat.surface;
    if (!this.content.material.has(material)) return;
    if (t.surfaces.length >= MOST.surface) {
      this.say('That is as many stretches of surface as a track can have.');
      return;
    }
    this.change(() => {
      t.surfaces.push(surfaceBetween(this.road(), material, p, q));
      this.sel = { kind: 'surface', index: t.surfaces.length - 1 };
    });
  }

  /** A thing or a material was picked from the catalogue. */
  private chose(kind: 'prop' | 'material', id: string): void {
    const t = this.track;
    const sel = this.sel;
    if (!t) return;
    if (kind === 'prop') {
      // the chosen thing becomes what was picked (an animal keeps to its own size)
      const it = this.item;
      if (it && it.prop !== id)
        this.change(() => {
          it.prop = id;
          if (this.content.prop.get(id)?.critter) delete it.size;
        });
      this.swapping = false;
    } else {
      // the chosen pool, area or stretch becomes what was picked
      const o =
        sel?.kind === 'pool'
          ? t.pools[sel.index]
          : sel?.kind === 'area'
            ? t.areas[sel.index]
            : sel?.kind === 'surface'
              ? t.surfaces[sel.index]
              : undefined;
      if (o && o.material !== id) this.change(() => (o.material = id));
    }
    this.ui.render();
  }

  /** Put a thing down at a point on the ground (a tap with THINGS, or a drop from the catalogue). */
  put(prop: string, x: number, y: number): void {
    const t = this.track;
    const s = this.s;
    const def = this.content.prop.get(prop);
    if (!t || !s || !def) return;
    if (!(x > 12 && y > 12 && x < t.size.w - 12 && y < t.size.h - 12)) return;
    if (t.items.length >= MOST.item) {
      this.say('That is as many things as a track can hold.');
      return;
    }
    if (this.tool !== 'place') this.tool = 'place';
    [x, y] = this.settle('item', x, y);
    this.cat.used(def.id);
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
  use(x: number, y: number, tool: Tool = this.tool): void {
    const t = this.track;
    const s = this.s;
    if (!t || !s) return;
    this.tool = tool;
    const at = this.hit(x, y);
    if (tool === 'erase') {
      if (at) this.erase(at);
      return;
    }
    const none = (): void => {
      this.sel = null;
      this.swapping = false;
      this.ui.render();
    };
    if (at) {
      this.sel = at;
      this.swapping = false;
      // (a tap on a raised stretch picks the level of it under the finger)
      const up = at.kind === 'raised' ? t.raised[at.index] : undefined;
      if (up) this.part = levelAt(this.road(), up, x, y);
      this.ui.render();
      return;
    }
    // a tap on open ground lets go of the chosen thing; the next one puts something down
    if (tool === 'hand' || (tool === 'place' && this.sel)) return none();
    const inside = x > 12 && y > 12 && x < t.size.w - 12 && y < t.size.h - 12;
    if (!inside) return;
    if (tool === 'road') {
      const near = roadAt(t.road.points, x, y);
      if (near.d > t.road.width / 2 + this.reach()) return none();
      if (t.road.points.length >= MOST.point) {
        this.say('That is as many points as a road can have.');
        return;
      }
      this.change(() => (this.sel = { kind: 'point', index: insertPoint(t, x, y) }));
    } else if (tool === 'place') {
      this.put(this.cat.prop, x, y);
    } else if (tool === 'surface' || tool === 'raise') {
      // a tap lays a short stretch, the tap in the middle of it
      const T = this.road();
      const near = nearestSample(T, x, y);
      if (near.d > t.road.width / 2 + this.reach('item')) return none();
      const end = (by: number): [number, number] => {
        const i = (near.i + by + T.n) % T.n;
        return [T.x[i]!, T.y[i]!];
      };
      const half = Math.min(30, Math.floor(T.n / 4));
      this.lay(end(-half), end(half));
    } else if (tool === 'area') {
      const material = this.content.material.has(this.cat.area) ? this.cat.area : '';
      if (!material && !this.sky) {
        this.say('Pick a ground, or a weather, first.');
        return;
      }
      if (t.areas.length >= MOST.area) {
        this.say('That is as many areas as a track can have.');
        return;
      }
      this.change(() => {
        t.areas.push({
          x: Math.round(x),
          y: Math.round(y),
          r: this.areaR,
          material,
          sky: this.sky,
        });
        this.sel = { kind: 'area', index: t.areas.length - 1 };
      });
    } else if (tool === 'bridge') {
      const near = roadAt(t.road.points, x, y);
      if (near.d > t.road.width / 2 + this.reach()) return none();
      if (t.bridges.length >= MOST.bridge) {
        this.say('That is as many bridges as a track can have.');
        return;
      }
      this.change(() => {
        t.bridges.push({
          x: Math.round(x),
          y: Math.round(y),
          length: this.span,
          ...(this.rails ? {} : { rails: false }),
        });
        this.sel = { kind: 'bridge', index: t.bridges.length - 1 };
      });
    } else {
      const material = this.cat.pool;
      if (!this.content.material.has(material)) return;
      if (t.pools.length >= MOST.pool) {
        this.say('That is as many pools as a track can hold.');
        return;
      }
      this.change(() => {
        t.pools.push({ material, x: Math.round(x), y: Math.round(y), r: this.poolR });
        this.sel = { kind: 'pool', index: t.pools.length - 1 };
      });
    }
  }

  // ---- once a frame

  /** The marks over the map: the road's points, what was put down by hand, and what is chosen. */
  draw(g: CanvasRenderingContext2D, dt: number): void {
    if (!this.track || !this.s) return;
    this.creep(dt);
    // (once a frame at most, however many steps the finger took in it)
    if (this.relift) this.reground();
    paint(g, this);
    this.ui.tick(dt);
  }
}
