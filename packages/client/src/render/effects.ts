import { DECK_SURFACE, DT, type MaterialManifest, type SimEvent } from '@demodogs/shared';
import { wading, type Car, type StaticProp, type World } from '@demodogs/sim';
import { roll } from './dice';
import { SliceFx } from './slice-fx';
import { Spread } from './spread';
import { createWalker, place, step, type Walker } from './rig';
import type { Art } from './art';
import { BODY_UP } from './lamps';
import { markGround, paintHollow, type Ground } from './ground';
import { fallTime, floorOf, laidOut, type Toppling } from './collapse';
import { tall, type Strip } from './stack';
import {
  char,
  clone,
  dent,
  pixels,
  stripOf,
  blowApart,
  dropLoose,
  pale,
  restore,
  stripCrown,
  voxelsOf,
  type Chip,
} from './strips';
import {
  launch,
  launchTogether,
  pickSome,
  shards,
  stepVoxel,
  type Burst,
  type Voxel,
} from './voxels';
import {
  HAZE,
  SOOT,
  WIND,
  shade,
  stepParticle,
  type FxKind,
  type Particle,
} from './pixel/particles';
import { CKind, Cells } from './pixel/cells';
import { AddonFx } from './addons-fx';
import { DefenceFx } from './defence-fx';
import { PLAIN, Wreckage } from './wreckage';
import type { Sound, Timbre } from '../audio/sound';
import { dropEvent, feedClouds } from './drops-fx';
import { ShockFx } from './shock-fx';
import { howlEvent, howlTick, type Ripple } from './howl-fx';
import { GuardState, guardEvent, guardTick } from './guards-fx';
import { CatchupFx } from './catchup-fx';
import { TrickFx } from './tricks-fx';
import { LifeFx } from './life-fx';
import { armsEvent, armsTick } from './arms-fx';
import { arsenalEvent, arsenalTick } from './arsenal-fx';
import { WeatherFx } from './weather-fx';
import { wildEvent } from './wild-fx';

const TAU = Math.PI * 2;
/** The dents and wrecks have been run in on this visit (see the constructor). */
let ranIn = false;
/** The page's clock, for sharing a tick's time out (never for anything the sim sees). */
const now = (): number => performance.now();
const hex = (rgb: number) => '#' + rgb.toString(16).padStart(6, '0');
const rand = (a: number, b: number) => a + roll() * (b - a);
const pick = <T>(a: readonly T[]): T => a[Math.floor(roll() * a.length)]!;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export type { FxKind, Particle };
export interface Debris {
  strip: Strip;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  spin: number;
  life: number;
}
export interface Flash {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  rgb: number;
}
/** A patch of fire left burning for a moment: it feeds flames, a smoke column and embers. */
export interface Fire {
  x: number;
  y: number;
  /** Radius of the burning patch, art px. */
  r: number;
  life: number;
  max: number;
}
export interface FloatText {
  x: number;
  y: number;
  z: number;
  text: string;
  col: string;
  life: number;
  max: number;
  big: boolean;
}

/** The most loose voxels in the air at once. */
const MAX_VOXELS = 4000;
/** Ticks a blast goes on letting go soot into its rolling air (mudders' SMOKE_FEED). */
const SOOT_FEED = 70;
/** Ticks a blast lets go its burning gas over (mudders' FIRE_FEED). */
const FIRE_FEED = 10;
/** The most pieces of scenery that keep their own damaged copy of their art. */
const MAX_SCARRED = 260;
/** A strip this many texels or more is never copied to be scarred (deck pieces): the atlas has no room. */
const BIG_STRIP = 120_000;
const big = (s: Strip): boolean => s.cw * s.ch * s.n >= BIG_STRIP;
/** mudders' soot tones: what a blast's smoke is made of. */
const SMOKE_TONES = [0x4e4648, 0x625a5c, 0x777073, 0x5a4e48] as const;
/**
 * Milliseconds a tick given to dents, wrecks and the like that are waiting their turn (see
 * `Spread`); more when a lot is waiting.
 */
const HEAVY_MS = 2;
/** The most particles alive at once. */
const MAX_FX = 1800;

const BOT_RIG = {
  thigh: 3.4,
  shin: 3.6,
  ankle: 0.8,
  hipHalf: 2.2,
  standHip: 6.2,
  stride: 9,
  duty: 0.58,
  lift: 2.2,
  bob: 0.45,
  twist: 0.12,
  spine: 6,
  kneeHint: -1,
};

/**
 * Everything the client shows that the sim does not track: particles, flying debris, floating
 * words, screen shake, each car's dented body, the bots' walk rigs and the big centre message.
 * It reads the sim's events after every tick and plays them as sights and sounds.
 */
/** Screen cells per gas cell at an effects quality: four at full, down to one on a slow device. */
export const splitFor = (quality: number): number =>
  quality > 0.8 ? 4 : quality > 0.6 ? 3 : quality > 0.4 ? 2 : 1;
const withSplit = (c: Cells, quality: number): Cells => {
  c.split = splitFor(quality);
  return c;
};

/** A pool wider than this (art px) is an area of terrain, painted as one shape. */
const TERRAIN_FROM = 90;

export class Effects {
  readonly fx: Particle[] = [];
  /** Particles that have burnt out, kept to be used again (see `emit`). */
  private readonly spent: Particle[] = [];
  readonly debris: Debris[] = [];
  /** Buildings falling over (see collapse.ts), and those that went that way. */
  readonly toppling: Toppling[] = [];
  private readonly toppled = new Set<StaticProp>();
  readonly texts: FloatText[] = [];
  readonly bodies: Strip[] = [];
  /** Short bursts of light (explosions, muzzle flashes) for renderers that light the world. */
  readonly flashes: Flash[] = [];
  /** Each car's nose gun: which barrel fired last, and when. */
  private readonly gunShots = new Map<number, { side: number; at: number }>();
  /** Loose voxels knocked off cars and props, flying until they settle into the ground. */
  readonly voxels: Voxel[] = [];
  /** What is left of scenery that came down: pieces, heaps of grit, and all of it flying home. */
  readonly wreck: Wreckage = new Wreckage(
    {
      voxels: this.voxels,
      room: () => Math.max(0, MAX_VOXELS - this.voxels.length),
      strip: stripOf,
      changed: (s) => this.changed.add(s),
      dropped: (s) => this.dropped.push(s),
      dust: (x, y, z) => this.puff(x, y, z, 'dust'),
      spark: (x, y, z) => this.spark(x, y, z, 60),
      thud: (x, y, hit) => {
        const v = this.vol(x, y);
        if (v > 0 && hit > 110) this.sound.crash(hit * 0.02 * v);
        if (this.near(x, y, 140)) this.shake = Math.max(this.shake, Math.min(5, hit * 0.02));
      },
      soak: (g) => this.soak(g.x, g.y, g.s, g.rgb),
    },
    roll,
  );
  /**
   * Dents, wrecks and scars waiting their turn, each about the strip it changes: a big blast
   * asks for a dozen in one tick, and they are done a few a tick instead. Whatever reads or
   * replaces a strip that may have some waiting calls `heavy.settle(strip)` first.
   */
  private readonly heavy = new Spread<Strip>();
  /** Shared art not yet cut into the blocks it bursts into: done one a tick while nothing waits. */
  private readonly unCut: Strip[] = [];
  /** Pieces told to mend this step: they rebuild as one, so the sweep runs across them all. */
  private mends: { s: StaticProp; in: number }[] = [];
  /** Scenery that has had a bite taken out of it: its own copy of the art, with the hole. */
  readonly scarred = new Map<StaticProp, Strip>();
  private readonly tones = new Map<string, number[]>();
  /** Single cells of fire and smoke, and the rolling air that carries them. */
  readonly cells = withSplit(new Cells(24000), 1);
  private q = 1;
  /**
   * How much of the full effect to draw: 1 everything, less on a slow device. Gas cells are let
   * go `split` screen cells at a time (finer grain), fewer as the quality drops.
   */
  get quality(): number {
    return this.q;
  }
  set quality(v: number) {
    this.q = v;
    this.cells.split = splitFor(v);
  }
  /** Blasts still letting go of their burning gas and soot. */
  readonly blasts: {
    x: number;
    y: number;
    z: number;
    r: number;
    /** Fire cells still to let go, over `ticks` more ticks. */
    left: number;
    ticks: number;
    high: boolean;
    /** Ticks since it went off. */
    age: number;
    /** The shades of its soot. */
    tones: readonly number[];
  }[] = [];
  /** Fires still burning where something blew up. */
  readonly fires: Fire[] = [];
  private readonly propAlive: boolean[] = [];
  /** Strips redrawn since a renderer last looked (dents, charring, a fresh body). */
  readonly changed = new Set<Strip>();
  /** Strips of its own that will not be drawn again (the renderer gives their room back). */
  readonly dropped: Strip[] = [];
  /** What each piece of shared art breaks into, worked out once. */
  private readonly bits = new WeakMap<Strip, Map<number, Chip[]>>();
  readonly walkers: Walker[] = [];
  shake = 0;
  /** Shock pulses: the crackling rings, bolts and dead engines, as single spark cells. */
  readonly shock: ShockFx;
  /** Howls: rings of bent air still spreading, for the renderer's lens pass. */
  readonly ripples: Ripple[] = [];
  msg = '';
  msgT = 0;
  private readonly smokeT: number[] = [];
  /** Where each car's two back wheels last marked the ground (x, y, x, y) and whether they did. */
  private readonly ruts: number[][] = [];

  /** Shield bubbles and field welding. */
  readonly defence: DefenceFx;
  /** Guards: where turrets point, which feelers twitch and which claws are down. */
  readonly guards = new GuardState();
  /** Catch-up items: size bursts, the gale, the lead ball. */
  readonly catchup = new CatchupFx();
  /** The tricks out of the Bag of Tricks: their bursts, their steady signs, doors and paws. */
  readonly tricks = new TrickFx();
  /** Things going up slice by slice, and tall scenery seen through to your car (slice-fx.ts). */
  readonly slices = new SliceFx();
  /** Track tiles and animals: boost fire, ramp dust, feathers. */
  readonly life = new LifeFx();
  /** World modifiers: rain, wind, lightning, night, quakes and the rest. */
  readonly weather: WeatherFx;
  /** Add-ons going on, coming off and at work. */
  readonly addons: AddonFx;

  constructor(
    readonly w: World,
    private readonly art: Art,
    private readonly ground: Ground,
    private readonly sound: Sound,
  ) {
    for (const c of w.cars) this.bodies.push(clone(this.carArt(c).body));
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.defence = new DefenceFx({
      w,
      bodies: this.bodies,
      changed: this.changed,
      flashes: this.flashes,
      freshBody: (c) => this.carArt(c).body,
      particle: (...a) => this.emit(...a),
      pop: (x, y) => {
        const v = this.vol(x, y);
        if (v > 0) sound.pop(v);
      },
    });
    this.addons = new AddonFx({
      w,
      art,
      flashes: this.flashes,
      get quality() {
        return self.quality;
      },
      freshBody: (c) => this.carArt(c).body,
      shatter: (strip, at, ox, oy, speed, vx, vy) =>
        this.burst(this.chipsOf(strip, true, strip.res), 160, {
          x: at[0],
          y: at[1],
          z: at[2],
          h: at[3],
          ox,
          oy,
          speed,
          vx,
          vy,
        }),
      particle: (...a) => this.emit(...a),
      spark: (x, y, z, sp) => this.spark(x, y, z, sp),
      flame: (...a) => this.flame(...a),
      plume: (x, y, z, size) => this.plume(x, y, z, size),
      text: (x, y, t, col) => this.text(x, y, t, col),
      msg: (t, s) => this.setMsg(t, s),
      vol: (x, y) => this.vol(x, y),
      shake: (k) => (this.shake = Math.max(this.shake, k)),
      sound: (what, v) => {
        if (what === 'scrape') sound.scrape();
        else if (what === 'pickup') sound.pickup();
        else if (what === 'repair') sound.repair();
        else sound[what](v);
      },
    });
    for (const b of w.bots) {
      const wk = createWalker(BOT_RIG);
      place(wk, b.x, b.y, b.h);
      this.walkers.push(wk);
    }
    this.shock = new ShockFx(
      w,
      this.flashes,
      sound,
      (x, y) => this.vol(x, y),
      (k) => (this.shake = Math.max(this.shake, k)),
    );
    // the first dents and the first wreck of a visit are not the slow ones: the code that does
    // them has been run in, on a copy of a body, before the race (once a visit, about 0.2 s)
    if (!ranIn && w.cars[0]) {
      ranIn = true;
      const whole = this.carArt(w.cars[0]).body;
      const spare = clone(whole);
      // (several times over: the engine only settles on its fast code after a few goes)
      for (let go = 0; go < 5; go++) {
        restore(spare, whole);
        for (let i = 0; i < 10; i++)
          dent(spare, rand(-8, 8), rand(-4, 4), rand(1.3, 7), rand(0.05, 0.6), roll, 1);
        blowApart(spare, 0.5, roll);
        dropLoose(spare);
        char(spare);
      }
    }
    // what can burst in a race is cut into its blocks before it does, one kind a tick (the
    // countdown is long enough for all of them): the loose props, and what scenery leaves behind
    const kinds = new Set<string>();
    for (const p of w.props) kinds.add(p.def.id);
    for (const s of w.statics) if (s.def.rubble) kinds.add(s.def.rubble.prop);
    for (const id of kinds) this.unCut.push(art.prop(id));
    // the pools the map starts with
    // (water is not painted on: the ground's painter draws it from the water map, see water.ts)
    for (const s of w.spills)
      if (s.fixed && !(s.def.water && ground.water) && !(s.def.look && ground.pools)) {
        if (s.r > TERRAIN_FROM) this.terrain(s.def, s.x, s.y, s.r);
        else this.pool(s.def, s.x, s.y, s.r);
      }
    this.weather = new WeatherFx(this, w, sound);
  }

  /** The art, for the effects kept in other files. */
  get artOf(): Art {
    return this.art;
  }

  /** What a thing made of the material `id` sounds like when it is hit: a car's body without one. */
  timbre(id: string | undefined): Timbre {
    return (id && this.w.content.material.get(id)?.sound) || 'car';
  }

  /**
   * The edge of the world is a wall the sim has no name for; what stands along it is for looks
   * (a tyre fence, a board fence). A crash right against one of those sounds like it.
   */
  private fenceAt(x: number, y: number): string | undefined {
    for (const s of this.w.near(x, y, 16))
      if (!s.def.solid && s.def.made && !s.down && Math.hypot(s.x - x, s.y - y) < s.def.radius + 9)
        return s.def.made;
    return undefined;
  }

  /** A heavy landing, as loud as `v`. */
  thump(v: number): void {
    this.sound.thud(v);
  }

  carArt(c: Car) {
    return this.art.car(c.def.id, c.paint);
  }

  setMsg(text: string, t: number): void {
    this.msg = text;
    this.msgT = t;
  }

  // ------------------------------------------------------------ helpers
  /** How far back a car's gun barrel on `side` is kicked just now, 1 to 0. */
  gunKick(c: Car, side: number): number {
    const g = this.gunShots.get(c.index);
    if (!g || g.side !== side) return 0;
    return Math.max(0, 1 - (this.w.time - g.at) / 0.1);
  }

  emit(
    kind: FxKind,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    rgb = 0,
  ): void {
    if (this.fx.length >= MAX_FX) return;
    // a particle that has burnt out is used again: a new one is a dozen objects to clear away
    const p = this.spent.pop();
    if (!p) {
      this.fx.push({ kind, x, y, z, vx, vy, vz, life, max: life, size, rgb });
      return;
    }
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = p.max = life;
    p.size = size;
    p.rgb = rgb;
    this.fx.push(p);
  }

  spark(x: number, y: number, z: number, sp = 0): void {
    const a = rand(0, TAU);
    const v = rand(20, 60) + sp * roll();
    this.emit(
      'spark',
      x,
      y,
      z,
      Math.cos(a) * v,
      Math.sin(a) * v,
      rand(30, 110),
      rand(0.25, 0.55),
      1,
      roll() < 0.5 ? 0xfff6c0 : 0xffb03a,
    );
  }

  /**
   * A thin puff of single cells: tyre smoke, or dust off the dirt. The air carries each cell on
   * its own, so a puff frays out cell by cell instead of fading as one blob.
   */
  puff(x: number, y: number, z: number, kind: 'smoke' | 'dust', vx = 0, vy = 0): void {
    const dust = kind === 'dust';
    this.cells.spray(
      CKind.Wisp,
      Math.max(1, Math.round(4 * this.quality)),
      x,
      y,
      z,
      2.5,
      1.5,
      vx,
      vy,
      dust ? 0 : 8,
      8,
      4,
      dust ? 0.5 : 0.8,
      dust ? 1.1 : 1.6,
      kind === 'smoke' ? 0x8a8680 : 0x9a8460,
    );
  }

  /**
   * What a wheel throws up off soft ground: a few single cells of the ground's own colour, flung
   * back and out from where it turns, that hang a moment and fall.
   */
  spray(x: number, y: number, rgb: number, vx: number, vy: number, wide: number): void {
    const n = Math.max(1, Math.round(3 * this.quality));
    // snow flies as bright grains that arc and drop; any other ground as dust of its own colour
    const pale = Math.min((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255) > 170;
    for (let i = 0; i < n; i++)
      if (pale)
        this.emit(
          'spark',
          x + rand(-1.5, 1.5),
          y + rand(-1.5, 1.5),
          rand(0.5, 2),
          vx * 0.3 + rand(-wide, wide),
          vy * 0.3 + rand(-wide, wide),
          rand(25, 70),
          rand(0.3, 0.7),
          1,
          rgb,
        );
      else
        this.cells.add(
          CKind.Wisp,
          x + rand(-1.5, 1.5),
          y + rand(-1.5, 1.5),
          rand(0.5, 2.5),
          vx * 0.25 + rand(-wide, wide),
          vy * 0.25 + rand(-wide, wide),
          rand(6, 20),
          rand(0.35, 0.8),
          rgb,
        );
  }

  /**
   * A lick of flame rising from (x, y, z): a clutch of burning cells, about `size` across.
   * (vx, vy, vz) is the way the fire is thrown.
   */
  flame(x: number, y: number, z: number, size: number, vx = 0, vy = 0, vz = rand(20, 45)): void {
    const n = Math.max(1, Math.round(size * size * 0.45 * this.quality));
    const r = size * 0.5;
    this.cells.spray(CKind.Bang, n, x, y, z, r, r, vx, vy, vz, 8, 10, 0.25, 0.6);
  }

  /** A puff of a smoke column: a clutch of smoke cells that the air and the wind carry off. */
  plume(x: number, y: number, z: number, size: number, rgb = SOOT, vz = rand(26, 44)): void {
    const n = Math.max(1, Math.round(size * size * 0.5 * this.quality));
    const r = size * 0.5;
    this.cells.spray(CKind.Wisp, n, x, y, z, r, r, 0, 0, vz, 6, 8, 1.2, 2.6, rgb);
  }

  ember(x: number, y: number, z: number): void {
    this.emit('ember', x, y, z, rand(-14, 14), rand(-14, 14), rand(25, 60), rand(0.8, 1.8), 1);
  }

  /**
   * An explosion, built the way mudders builds its blast (its fireball2 and feedFires). Nothing
   * is a drawn shape. The blast lets go a packed ball of white-hot cells and shoves the air
   * outward, so the ball flies out fat and round. Then two rolls of air wind up: one lying on the
   * ground that throws a sheet of fire out along it and up the outside, and a cap riding the hot
   * jet that takes fire up the middle and curls it out over the top. Burning gas is fed into both
   * for a sixth of a second, and soot the colour of the ground's dust for a second more, all
   * through where the fire was, so the ball goes dark from inside and hangs, still turning.
   * Round it: firework stars, a ring of sparks racing out with the shock, and a patch left burning.
   */
  fireball(x: number, y: number, power: number, z = 0): void {
    const high = z > 12;
    const r = 20 * Math.sqrt(power);
    const C = this.cells;
    // without the GPU stepping the gas, the same blast in a third of the cells
    const den = this.density();
    const turn = (0.9 + r * 0.03) * 22;
    C.gust({ x, y, z: z + 1, R: r * 1.1, v: (0.6 + r * 0.06) * 50 });
    const capR = Math.max(5, r * 0.45);
    C.ring({
      x,
      y,
      z: z + r * 0.75,
      vz: high ? 6 : 15,
      R: capR * 1.25,
      r: capR,
      spin: turn,
      grow: capR * 0.5,
      life: 2.3,
    });
    if (!high) {
      const roll = Math.max(5, r * 0.5);
      C.ring({
        x,
        y,
        z: roll * 0.85,
        vz: 0,
        R: r * 0.3 + roll * 0.6,
        r: roll,
        spin: -turn * 0.6,
        grow: roll * 0.9,
        life: 2,
      });
    }
    // the bang: a packed ball that fills the blast radius in a few ticks and burns out fast
    const nBang = Math.min(4000, Math.round(r * r * 7 * den));
    const vMax = r * 2.9;
    // (each cell is written into the cells' own scratch and let go from there: see `Cells.one`)
    const Q = C.q;
    for (let i = 0; i < nBang; i++) {
      const a = rand(0, TAU);
      const u = high ? rand(-1, 1) : rand(0, 1);
      const flat = Math.sqrt(1 - u * u);
      const sp = Math.cbrt(roll()) * vMax;
      const d = rand(0, r * 0.2);
      Q[0] = x + Math.cos(a) * flat * d;
      Q[1] = y + Math.sin(a) * flat * d;
      Q[2] = z + 1 + Math.abs(u) * d;
      Q[3] = Math.cos(a) * flat * sp;
      Q[4] = Math.sin(a) * flat * sp;
      Q[5] = u * sp * 0.8;
      Q[6] = rand(0.23, 0.73);
      C.one(CKind.Bang);
    }
    this.blasts.push({
      x,
      y,
      z,
      r,
      left: Math.min(6000, Math.round(r * r * 9 * den)),
      ticks: FIRE_FEED,
      high,
      age: 0,
      tones: high ? SMOKE_TONES : this.dustTones(x, y),
    });
    // the shock front: a ring of sparks racing out along the ground
    if (!high)
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * TAU;
        const v = vMax * 3;
        this.emit('spark', x, y, 2, Math.cos(a) * v, Math.sin(a) * v, 20, 0.22, 1, 0xfff6c0);
      }
    for (let i = 0; i < 20 * power; i++) {
      const a = rand(0, TAU);
      const v = rand(120, 300) * Math.sqrt(power);
      this.emit(
        'glitter',
        x,
        y,
        z + rand(2, 6),
        Math.cos(a) * v,
        Math.sin(a) * v,
        rand(high ? -80 : 60, 260),
        rand(0.5, 1.1),
        1,
        roll() < 0.5 ? 0xfff0a0 : 0xffa020,
      );
    }
    // a burst high in the air leaves no fire on the ground under it
    if (high) return;
    this.fires.push({
      x,
      y,
      r: 7 * Math.sqrt(power),
      life: 1.1 * Math.sqrt(power),
      max: 1.1 * Math.sqrt(power),
    });
  }

  /**
   * How thick a blast is let go: all of it with the GPU stepping the gas and room to spare, a
   * third without, and thinner as the air fills up (a chain of blasts shares the cells).
   */
  private density(): number {
    const g = this.cells.gpu;
    return this.quality * (g ? Math.max(0.25, 1 - (g.live / g.cap) * 1.2) : 0.3);
  }

  /**
   * What a blast's smoke is made of: mostly the dust of the ground it went off on, so a blast on
   * grass smokes olive, one on dirt tan and one on the road grey (mudders' soot). Four shades.
   */
  private dustTones(x: number, y: number): readonly number[] {
    let t: readonly number[];
    try {
      t = this.ground.tone(x, y);
    } catch {
      return SMOKE_TONES;
    }
    const base = [(t[0]! + 0x62) / 2, (t[1]! + 0x5c) / 2, (t[2]! + 0x58) / 2];
    return [0.6, 0.75, 0.9, 1.05].map(
      (k) =>
        (Math.min(255, Math.round(base[0]! * k)) << 16) |
        (Math.min(255, Math.round(base[1]! * k)) << 8) |
        Math.min(255, Math.round(base[2]! * k)),
    );
  }

  /** Let go this tick's share of each blast's burning gas and soot into its turning air. */
  private feed(): void {
    const C = this.cells;
    const Q = C.q;
    const den = this.density();
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i]!;
      const r = b.r;
      if (++b.age >= SOOT_FEED) {
        this.blasts.splice(i, 1);
        continue;
      }
      // soot: the ball goes dark as it burns out, so it is let go all through where the fire
      // was, thick at first, and it is caught by the same turning air
      if (b.age >= 6) {
        const k = 1 - b.age / SOOT_FEED;
        const puffs = Math.min(700, Math.round(r * r * 1.2 * den * k * k));
        const rise = (0.55 + r * 0.03) * 45;
        for (let p = 0; p < puffs; p++) {
          const a = rand(0, TAU);
          const d = Math.sqrt(roll()) * r * 0.8;
          Q[0] = b.x + Math.cos(a) * d;
          Q[1] = b.y + Math.sin(a) * d;
          Q[2] = b.z + rand(0, r * 0.7) + b.age * 0.25;
          Q[3] = Math.cos(a) * 15;
          Q[4] = Math.sin(a) * 15;
          Q[5] = (b.high ? rand(-0.2, 0.2) : rand(0.2, 0.6)) * rise;
          Q[6] = rand(2.6, 6.2);
          C.one(CKind.Wisp, b.tones[(roll() * 4) | 0]!);
        }
      }
      if (b.ticks <= 0) continue;
      const n = Math.ceil(b.left / b.ticks);
      b.left -= n;
      b.ticks--;
      const heart = b.high ? n : Math.round(n * 0.7);
      const out = r / 20;
      for (let k = 0; k < n; k++) {
        const a = rand(0, TAU);
        if (k < heart) {
          // packed over the impact and thrown up into the cap
          const d = Math.sqrt(roll()) * r * 0.75;
          Q[0] = b.x + Math.cos(a) * d;
          Q[1] = b.y + Math.sin(a) * d;
          Q[2] = b.z + rand(0, r * 0.8) * (1 - (d / r) * 0.8);
          Q[3] = Math.cos(a) * d * 1.6;
          Q[4] = Math.sin(a) * d * 1.6;
          Q[5] = b.high ? rand(-20, 20) : rand(20, 47) * out;
          Q[6] = rand(1.17, 3.3);
          C.one(CKind.Fire);
        } else {
          // a sheet thrown out along the ground, into the underside of the ground roll
          const d = r * rand(0.25, 0.6);
          const v = rand(30, 75) * out;
          Q[0] = b.x + Math.cos(a) * d;
          Q[1] = b.y + Math.sin(a) * d;
          Q[2] = b.z + rand(0, 3);
          Q[3] = Math.cos(a) * v;
          Q[4] = Math.sin(a) * v;
          Q[5] = rand(0, 10);
          Q[6] = rand(1.17, 3.3);
          C.one(CKind.Fire);
        }
      }
    }
  }

  text(x: number, y: number, text: string, col = '#fff', big = false): void {
    this.texts.push({ x, y, z: 26, text, col, life: big ? 1.8 : 1.2, max: big ? 1.8 : 1.2, big });
  }

  fling(
    strip: Strip,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    rot: number,
    life: number,
  ): void {
    this.debris.push({ strip, x, y, z, vx, vy, vz, rot, spin: rand(-14, 14), life });
  }

  /** How many of the world's shapes in the road have been looked at for painting. */
  private hollows = 0;

  paintGround(x: number, y: number, r: number, fn: (g: CanvasRenderingContext2D) => void): void {
    fn(this.ground.g);
    markGround(this.ground, x, y, r);
  }

  /**
   * Let leaves that came off a tree go as single cells: up to `max` of them, each from where it
   * grew, thrown at (vx, vy) and scattered by `spread`.
   */
  private leaves(
    s: StaticProp,
    off: Chip[],
    max: number,
    vx: number,
    vy: number,
    spread: number,
  ): void {
    const cs = Math.cos(s.rot);
    const sn = Math.sin(s.rot);
    const keep = Math.min(1, (max * Math.max(0.35, this.quality)) / (off.length || 1));
    for (const c of off) {
      if (roll() >= keep) continue;
      const k = rand(0.35, 1.2);
      this.cells.add(
        CKind.Leaf,
        s.x + c.x * cs - c.y * sn,
        s.y + c.x * sn + c.y * cs,
        c.z + (s.lift ?? 0),
        vx * k + rand(-1, 1) * spread,
        vy * k + rand(-1, 1) * spread,
        rand(-0.2, 1) * spread,
        rand(5, 9),
        c.rgb,
      );
    }
  }

  /** The colours of a kind of tree's leaves, sampled from its art once. */
  private leafTones(s: StaticProp): number[] {
    let t = this.tones.get(s.def.id);
    if (!t) {
      const C = s.def.crown!;
      const all = voxelsOf(this.art.prop(s.def.id)).filter(
        (c) => Math.hypot(c.x, c.y) > C.trunk || c.z > C.top,
      );
      t = [];
      for (let i = 0; i < 12 && all.length; i++) t.push(all[Math.floor(roll() * all.length)]!.rgb);
      this.tones.set(s.def.id, t);
    }
    return t;
  }

  /** Now and then a leaf lets go of a tree near the player and drifts off on the wind. */
  private leafFall(): void {
    if (roll() > 0.3 * this.quality) return;
    const P = this.w.player;
    const list = this.w.near(P.x, P.y, 230);
    const s = list[Math.floor(roll() * list.length)];
    const C = s?.def.crown;
    if (!s || !C || s.down || !s.leaves || roll() > s.leaves) return;
    const t = this.leafTones(s);
    if (!t.length) return;
    const a = rand(0, TAU);
    const d = rand(0.3, 1) * (s.def.radius + 3);
    this.cells.add(
      CKind.Leaf,
      s.x + Math.cos(a) * d,
      s.y + Math.sin(a) * d,
      C.top + rand(0, 5),
      rand(-6, 6),
      rand(-6, 6),
      0,
      rand(5, 9),
      pick(t),
    );
  }

  /** Leaves that have come down stay where they lie, a cell each. */
  private litter(): void {
    const L = this.cells.landed;
    if (!L.length) return;
    const g = this.ground.g;
    for (let i = 0; i < L.length; i += 3) {
      g.fillStyle = hex(L[i + 2]!);
      g.fillRect(Math.floor(L[i]!), Math.floor(L[i + 1]!), 1, 1);
      markGround(this.ground, L[i]!, L[i + 1]!, 1);
    }
    L.length = 0;
  }

  /** Rebuild everything told to mend this step as one: its rubble flies home (see `Wreckage`). */
  private mendAll(): void {
    this.wreck.mend(
      this.mends.map(({ s, in: dur }) => ({ o: s, dur, tall: tall(this.art.prop(s.def.id)) })),
    );
    this.mends = [];
  }

  /** A piece of shared art as blocks, kept: many of a kind burst the same way. */
  private chipsOf(art: Strip, shared = true, block = art.res * 2): Chip[] {
    if (!shared) return voxelsOf(art, block);
    let byBlock = this.bits.get(art);
    if (!byBlock) this.bits.set(art, (byBlock = new Map()));
    let c = byBlock.get(block);
    if (!c) byBlock.set(block, (c = voxelsOf(art, block)));
    // the list itself, not a copy: `burst` picks from it in place and trims nothing
    return c;
  }

  /**
   * A whole area of ground in a material (a snowfield, a sheet of ice, a desert): too big to lay
   * cell by cell, so it is one ragged shape laid in thin coats, each smaller than the last, so
   * that it fades out over its outer half; then drifts of lighter and darker cells, thinning
   * out the same way.
   */
  terrain(m: MaterialManifest, x: number, y: number, r: number): void {
    if (this.pour(m, x, y, r)) return;
    const rgb = parseInt(m.colour.slice(1), 16);
    const k = 3 + Math.floor(rand(0, 3));
    const ph = rand(0, TAU);
    const edge = (a: number): number =>
      r * (0.9 + 0.06 * Math.sin(a * k + ph) + 0.04 * Math.sin(a * (k * 2 + 1) - ph));
    this.paintGround(x, y, r + 3, (g) => {
      g.fillStyle = m.colour;
      // thin enough in the middle that the road still shows through it
      const most = Math.min(0.72, Math.max(m.alpha, 0.6));
      const COATS = 14;
      g.globalAlpha = 1 - (1 - most) ** (1 / COATS);
      for (let c = 0; c < COATS; c++) {
        const f = 1 - (c / (COATS - 1)) * 0.5;
        g.beginPath();
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * TAU;
          const d = edge(a) * f + rand(-2, 2);
          g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
        }
        g.closePath();
        g.fill();
      }
      const n = Math.min(60000, Math.round(r * r * 0.25));
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const q = Math.sqrt(rand(0, 1));
        const d = q * edge(a) * 1.02;
        g.globalAlpha = rand(0.25, 0.7) * Math.min(1, (1.02 - q) * 2.2);
        g.fillStyle = hex(shade(rgb, rand(0.8, 1.1)));
        g.fillRect(
          Math.round(x + Math.cos(a) * d),
          Math.round(y + Math.sin(a) * d),
          Math.round(rand(1, 4)),
          1,
        );
      }
      g.globalAlpha = 1;
    });
  }

  /** A pool on the ground: a ragged blot of the material's colour, cell by cell, with a sheen. */
  /** One cell of foam on the water at (x, y), sliding off at (vx, vy). */
  private foam(x: number, y: number, vx: number, vy: number, life: number, size = 1): void {
    this.emit('foam', x, y, 0, vx, vy, 0, life, size, roll() < 0.3 ? 0xd6f1fb : 0xf7fcff);
  }

  /** Drops thrown up off the water at (x, y): `n` of them, as hard as `v`, about (vx, vy). */
  private drops(x: number, y: number, n: number, v: number, vx = 0, vy = 0): void {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const out = rand(0.2, 1) * v;
      this.emit(
        'pip',
        x + rand(-2, 2),
        y + rand(-2, 2),
        rand(0.5, 2),
        vx + Math.cos(a) * out,
        vy + Math.sin(a) * out,
        rand(0.6, 1.5) * v + 30,
        rand(0.3, 0.6),
        0.5,
        roll() < 0.5 ? 0xf7fcff : 0xbfe9f7,
      );
    }
  }

  /**
   * Something went into the water at (x, y), as hard as `k` (1 a car driving in, 3 one dropping
   * in off a jump): drops thrown up, and a ring of foam that runs out from it.
   */
  splash(x: number, y: number, k: number): void {
    const q = this.quality;
    this.drops(x, y, Math.round((6 + 10 * k) * q), 28 + 16 * k);
    const n = Math.round((10 + 9 * k) * q);
    const ph = rand(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = ph + (i / n) * TAU;
      const v = (20 + 12 * k) * rand(0.85, 1.15);
      this.foam(
        x + Math.cos(a) * 5,
        y + Math.sin(a) * 5,
        Math.cos(a) * v,
        Math.sin(a) * v,
        rand(0.5, 0.8) + 0.12 * k,
        k > 2 ? 1.5 : 1,
      );
    }
    const v = this.vol(x, y);
    if (v > 0) {
      this.sound.hiss(Math.min(1, 0.25 + 0.2 * k) * v);
      if (k > 2) this.sound.thud(0.7 * v);
    }
  }

  /** Seconds each car's tyres stay alight after it has come out of lava. */
  private readonly alight: number[] = [];

  /**
   * A car in lava burns where it stands, boldly: flames up round the whole body, sparks and a
   * column of black smoke, and when it gets out its tyres stay alight for a moment and trail
   * fire. On ice it throws up chips of ice from under the wheels and leaves no rut. Returns
   * whether the ground under it is such a pool (nothing to mark, no dust to raise).
   */
  private poolFx(c: Car, i: number, cs: number, sn: number): boolean {
    const hot = (c.scald ?? 0) > 0;
    const lit = (this.alight[i] ?? 0) > 0;
    const k = c.size;
    const L = c.def.body.halfLength * k;
    const W = c.def.body.halfWidth * k;
    const q = this.quality;
    if (hot) this.alight[i] = 1.6;
    else if (lit) this.alight[i]! -= DT;
    if ((hot || lit) && !c.wrecked && this.near(c.x, c.y, 280)) {
      const n = hot ? 5 : 1;
      for (let j = 0; j < n; j++) {
        if (roll() > (hot ? 0.9 : 0.6) * q) continue;
        // (out of the lava it is the four wheels that burn)
        const fx = hot ? rand(-1, 1) : roll() < 0.5 ? -0.7 : 0.7;
        const fy = hot ? rand(-1, 1) : roll() < 0.5 ? -1 : 1;
        const x = c.x + cs * L * fx - sn * W * fy;
        const y = c.y + sn * L * fx + cs * W * fy;
        this.flame(
          x,
          y,
          c.z + (hot ? rand(0, 4) : 0),
          hot ? rand(5, 8) : 3,
          c.vx * 0.5,
          c.vy * 0.5,
        );
      }
      if (hot) {
        if (roll() < 0.5 * q) this.plume(c.x, c.y, c.z + 6, rand(3, 5));
        if (roll() < 0.4 * q) this.spark(c.x + rand(-L, L), c.y + rand(-W, W), c.z + 2, 30);
        if (roll() < 0.25 * q) this.ember(c.x, c.y, c.z + 4);
      } else if (roll() < 0.3 * q) this.puff(c.x, c.y, c.z + 2, 'smoke');
    }
    if (hot) return true;
    const P = this.ground.pools;
    if (!P || c.deck > 0 || c.z - c.deck > 0.5 || P.depth(c.x, c.y) <= 0) return false;
    // (not lava, so ice) chips fly from under the wheels when it slides or is driven hard
    const v = Math.hypot(c.vx, c.vy);
    if (v > 30 && this.near(c.x, c.y, 260) && roll() < (c.sliding ? 0.9 : 0.35) * q) {
      const side = roll() < 0.5 ? -1 : 1;
      const end = roll() < 0.5 ? -0.7 : 0.7;
      const a = rand(0, TAU);
      this.emit(
        'pip',
        c.x + cs * L * end - sn * W * side,
        c.y + sn * L * end + cs * W * side,
        0.5,
        c.vx * 0.3 + Math.cos(a) * 18,
        c.vy * 0.3 + Math.sin(a) * 18,
        rand(20, 45),
        rand(0.3, 0.6),
        roll() < 0.3 ? 1 : 0.5,
        roll() < 0.5 ? 0xffffff : 0xcfeaf8,
      );
    }
    return true;
  }

  /** Whether each car was in water a tick ago, and how high over the ground it was. */
  readonly wetWas: boolean[] = [];
  private readonly highWas: number[] = [];

  /**
   * A car in water (`wading` in the sim: the pools it is slowed by are the water drawn): a splash
   * as it goes in, then foam folded back off its nose down both sides and churned up behind it,
   * and small drops off the wheels, all of it more the faster it goes. One going under in deep
   * water boils. Returns whether it is in water.
   */
  private wade(c: Car, i: number, cs: number, sn: number): boolean {
    const w = this.w;
    const wet = (w.spills.length > 0 && wading(w, c)[0] > 0) || (c.drown ?? 0) > 0;
    const was = this.wetWas[i] ?? false;
    const fell = (this.highWas[i] ?? 0) > 3;
    this.wetWas[i] = wet;
    this.highWas[i] = c.z - c.deck;
    if (!wet) return false;
    const v = Math.hypot(c.vx, c.vy);
    const k = c.size;
    if (!was && (v > 25 || fell)) this.splash(c.x, c.y, fell ? 3 : Math.min(2, v / 70));
    if (!this.near(c.x, c.y, 260)) return true;
    const q = this.quality;
    if ((c.drown ?? 0) > 0) {
      // going under: the water closes over it, bubbling
      if (roll() < 0.7 * q) {
        const a = rand(0, TAU);
        const r = rand(2, 9) * k;
        this.foam(
          c.x + Math.cos(a) * r,
          c.y + Math.sin(a) * r,
          Math.cos(a) * 9,
          Math.sin(a) * 9,
          0.4,
        );
      }
      if (roll() < 0.2 * q) this.drops(c.x, c.y, 1, 14);
      return true;
    }
    const L = c.def.body.halfLength * k;
    const W = c.def.body.halfWidth * k;
    const go = Math.min(1, v / 55);
    if (v < 6) {
      // standing in it: a ripple off the body now and then
      if (roll() < 0.04 * q) {
        const a = rand(0, TAU);
        this.foam(
          c.x + Math.cos(a) * L,
          c.y + Math.sin(a) * W,
          Math.cos(a) * 7,
          Math.sin(a) * 7,
          0.5,
        );
      }
      return true;
    }
    // which way it is really going (it slides about in water), and across that
    const ux = c.vx / v;
    const uy = c.vy / v;
    for (const side of [-1, 1]) {
      // the bow wave: off each corner of the end that leads, out and back
      if (roll() < (0.35 + 0.5 * go) * q) {
        const lead = c.vf >= 0 ? 1 : -1;
        const bx = c.x + cs * L * lead - sn * W * side * 0.8;
        const by = c.y + sn * L * lead + cs * W * side * 0.8;
        const out = (10 + 22 * go) * rand(0.7, 1.2);
        this.foam(
          bx,
          by,
          -uy * side * out + ux * v * 0.25,
          ux * side * out + uy * v * 0.25,
          rand(0.45, 0.8) + 0.3 * go,
        );
      }
      // the wake: churned water left behind the wheels, spreading a little
      if (roll() < (0.25 + 0.5 * go) * q) {
        const tail = c.vf >= 0 ? -1 : 1;
        const tx = c.x + cs * L * tail * rand(0.8, 1.1) - sn * W * side * rand(0.2, 0.9);
        const ty = c.y + sn * L * tail * rand(0.8, 1.1) + cs * W * side * rand(0.2, 0.9);
        this.foam(tx, ty, -uy * side * rand(3, 12), ux * side * rand(3, 12), rand(0.8, 1.7));
      }
      // small splashes off the wheels
      if (roll() < 0.3 * go * q) {
        const wx = c.x + cs * L * 0.6 * (roll() < 0.5 ? 1 : -1) - sn * W * side;
        const wy = c.y + sn * L * 0.6 * (roll() < 0.5 ? 1 : -1) + cs * W * side;
        this.drops(
          wx,
          wy,
          1,
          16 + 14 * go,
          c.vx * 0.4 - uy * side * 14,
          c.vy * 0.4 + ux * side * 14,
        );
      }
    }
    return true;
  }

  /** Water is poured into the ground's water map, where there is one, not blotted on. */
  private pour(m: MaterialManifest, x: number, y: number, r: number): boolean {
    // (and so is a pool with a look of its own: lava, ice)
    return !!(this.ground.water?.pour(m, x, y, r) || this.ground.pools?.pour(m, x, y, r));
  }

  pool(m: MaterialManifest, x: number, y: number, r: number): void {
    if (this.pour(m, x, y, r)) return;
    const rgb = parseInt(m.colour.slice(1), 16);
    const k = 2 + Math.floor(rand(0, 3));
    const ph = rand(0, TAU);
    this.paintGround(x, y, r + 3, (g) => {
      for (let py = Math.floor(y - r - 1); py <= y + r + 1; py++)
        for (let px = Math.floor(x - r - 1); px <= x + r + 1; px++) {
          const dx = px + 0.5 - x;
          const dy = py + 0.5 - y;
          const a = Math.atan2(dy, dx);
          const edge = r * (0.84 + 0.11 * Math.sin(a * k + ph) + 0.05 * Math.sin(a * (k + 3) - ph));
          const d = Math.hypot(dx, dy) / edge + rand(-0.07, 0.07);
          if (d > 1) continue;
          g.globalAlpha = m.alpha * (d > 0.86 ? 0.55 : 1);
          g.fillStyle = hex(shade(rgb, rand(0.88, 1.12)));
          g.fillRect(px, py, 1, 1);
        }
      // the sheen: a few light cells
      g.globalAlpha = 0.16;
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 4 + r * 0.4; i++)
        g.fillRect(
          Math.round(x + rand(-0.55, 0.55) * r),
          Math.round(y + rand(-0.55, 0.55) * r),
          Math.round(rand(1, 3)),
          1,
        );
      g.globalAlpha = 1;
    });
  }

  private splat(x: number, y: number): void {
    this.paintGround(x, y, 10, (g) => {
      g.fillStyle = 'rgba(16,14,20,0.55)';
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.arc(x + rand(-6, 6), y + rand(-5, 5), rand(1.5, 4), 0, TAU);
        g.fill();
      }
      g.fillStyle = 'rgba(60,200,220,0.25)';
      g.beginPath();
      g.arc(x, y, 3, 0, TAU);
      g.fill();
    });
  }

  scorch(x: number, y: number, r: number): void {
    this.paintGround(x, y, r + 1, (g) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(10,8,6,0.6)');
      gr.addColorStop(1, 'rgba(10,8,6,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    });
  }

  /**
   * A blast takes a bite out of the scenery around it: each piece in reach gets its own copy of
   * its art, cratered on the side that faced the blast, and what came off goes flying.
   */
  private scar(x: number, y: number, power: number): void {
    const reach = 10 + 14 * power;
    for (const s of this.w.statics) {
      const dx = x - s.x;
      const dy = y - s.y;
      const d = Math.hypot(dx, dy);
      // scenery that can be broken is told by the sim what it lost ('chip'); this is for the rest
      if (d > reach + s.def.radius || s.down || s.hp !== undefined) continue;
      let strip = this.scarred.get(s);
      if (!strip) {
        if (this.scarred.size >= MAX_SCARRED || big(this.art.prop(s.def.id))) continue;
        this.scarred.set(s, (strip = clone(this.art.prop(s.def.id))));
      }
      // the blast in the prop's own frame, pulled in to its edge
      const cs = Math.cos(s.rot);
      const sn = Math.sin(s.rot);
      const k = Math.min(1, (s.def.radius * 0.8) / (d || 1));
      const lx = (dx * cs + dy * sn) * k;
      const ly = (-dx * sn + dy * cs) * k;
      const mine = strip;
      this.heavy.later(mine, () => {
        // (unless it has come down or been rebuilt in the meantime)
        if (this.scarred.get(s) !== mine) return;
        const broke = dent(mine, lx, ly, 2.5 + 2.5 * power, 0.85, roll, 1);
        this.changed.add(mine);
        const from = { x: s.x, y: s.y, h: s.rot, z: s.lift ?? 0, ox: x, oy: y, vx: 0, vy: 0 };
        this.burst(broke.chips, 60, { ...from, speed: 70 + 50 * power });
        this.burst(broke.loose, 50, { ...from, speed: 30 }, true);
      });
    }
  }

  /** How loud a sound at (x, y) is for the player: 1 close, 0 far away. */
  vol(x: number, y: number): number {
    const P = this.w.player;
    return clamp(1 - Math.hypot(x - P.x, y - P.y) / 380, 0, 1);
  }

  private near(x: number, y: number, d: number): boolean {
    const P = this.w.player;
    return Math.hypot(x - P.x, y - P.y) < d;
  }

  // ------------------------------------------------------------ events
  handle(events: SimEvent[]): void {
    this.read(events);
    if (this.mends.length) this.mendAll();
    if (this.heavy.waiting) this.heavy.work(now, HEAVY_MS);
    else if (this.unCut.length) this.chipsOf(this.unCut.pop()!);
  }

  private read(events: SimEvent[]): void {
    const w = this.w;
    const S = this.sound;
    let smashAt = '';
    for (const e of events) {
      this.defence.handle(e);
      this.addons.handle(e);
      switch (e.t) {
        case 'hit': {
          const c = w.cars[e.car]!;
          const body = this.bodies[e.car]!;
          this.heavy.later(body, () => {
            const broke = dent(
              body,
              e.lx * 0.9,
              e.ly * 0.85,
              clamp(1.3 + e.amount * 0.2, 1.3, 7),
              clamp(e.amount / 45, 0.05, 0.6),
              roll,
              1,
            );
            this.changed.add(body);
            // what the blow knocked off flies away from the hit; what it cut loose drops in a piece
            const from = { ...this.carBurst(c), ox: e.x, oy: e.y };
            this.burst(broke.chips, 90, { ...from, speed: 30 + e.amount * 3 });
            this.burst(broke.loose, 60, { ...from, speed: 25 }, true);
          });
          // a blow to this screen's car is felt hard; one it lands on another, a little
          if (c === w.player && e.amount > 3)
            this.shake = Math.max(this.shake, Math.min(12, 2 + e.amount * 0.6));
          else if (e.by === w.player.index && e.amount > 6)
            this.shake = Math.max(this.shake, Math.min(6, 1.5 + e.amount * 0.3));
          break;
        }
        case 'crash': {
          for (let i = 0; i < 6; i++) this.spark(e.x, e.y, 3, e.impact * 0.4);
          const v = this.vol(e.x, e.y);
          if (v > 0) S.crash(e.impact * v, this.timbre(e.made ?? this.fenceAt(e.x, e.y)));
          // driving into something hard jolts the picture, whether or not it cost anything
          if (e.player && e.impact > 25)
            this.shake = Math.max(this.shake, Math.min(8, e.impact * 0.07));
          break;
        }
        case 'press': {
          // the ram lands: dust squirts out from under it on every side, sparks at its edges
          const s = w.statics[e.prop]!;
          const r = s.def.radius;
          for (let i = 0; i < 18; i++) {
            const a = rand(0, TAU);
            this.puff(
              e.x + Math.cos(a) * r,
              e.y + Math.sin(a) * r * 0.8,
              rand(0.5, 2),
              'dust',
              Math.cos(a) * rand(30, 70),
              Math.sin(a) * rand(30, 70),
            );
          }
          for (let i = 0; i < 10; i++)
            this.spark(e.x + rand(-r, r), e.y + rand(-r, r) * 0.7, 2, e.caught ? 120 : 50);
          const v = this.vol(e.x, e.y);
          if (v > 0) S.crash((e.caught ? 140 : 70) * v);
          if (this.near(e.x, e.y, 140)) this.shake = Math.max(this.shake, e.caught ? 7 : 3);
          break;
        }
        case 'scrape':
          this.spark(e.x, e.y, 3, 20);
          if (e.player) S.scrape();
          break;
        case 'detach': {
          const c = w.cars[e.car]!;
          const A = this.carArt(c);
          this.debris.push({
            strip: e.part === 'top' ? A.top : A.bumper,
            x: e.x,
            y: e.y,
            z: e.z,
            vx: e.vx,
            vy: e.vy,
            vz: rand(70, 140),
            rot: c.h,
            spin: rand(-9, 9),
            life: 9,
          });
          for (let i = 0; i < 6; i++) this.spark(e.x, e.y, 3, 60);
          break;
        }
        case 'wreck': {
          const c = w.cars[e.car]!;
          // the car bursts: about half of what is left of the body flies off, the rest is a burnt hull
          const body = this.bodies[e.car]!;
          // (in three goes, each a tick's work of its own for a body this size: blown apart,
          // then what that left hanging, then charred. It is drawn changed once all three are done)
          this.heavy.later(
            body,
            () => {
              const from = { ...this.carBurst(c), ox: c.x, oy: c.y };
              this.burst(blowApart(body, 0.5, roll), 260, { ...from, speed: 110 });
            },
            true,
          );
          this.heavy.later(
            body,
            () => {
              const from = { ...this.carBurst(c), ox: c.x, oy: c.y };
              this.burst(dropLoose(body), 80, { ...from, speed: 60 }, true);
            },
            true,
          );
          this.heavy.later(
            body,
            () => {
              char(body);
              this.changed.add(body);
            },
            true,
          );
          const A = this.carArt(c);
          for (let i = 0; i < 4; i++)
            this.fling(
              A.chunk,
              c.x,
              c.y,
              4,
              rand(-90, 90),
              rand(-90, 90),
              rand(90, 180),
              rand(0, TAU),
              7,
            );
          if (c === w.player) {
            this.setMsg(w.kind === 'race' ? 'TOTALLED! TOWING YOU BACK' : 'YOU ARE SCRAP', 2.4);
            // out of a derby for good: the blast first, then the bad news
            if (w.kind !== 'race') S.jingle('lost', 0.7);
          } else if (w.kind === 'derby' && this.near(c.x, c.y, 300) && e.by !== w.player.index)
            this.text(c.x, c.y, `${c.name} IS OUT`, '#ffb08a');
          break;
        }
        case 'respawn': {
          const c = w.cars[e.car]!;
          // paint the fresh body back into the same strip, so renderers keep their copy of it
          const body = this.bodies[e.car]!;
          this.heavy.settle(body);
          restore(body, this.carArt(c).body);
          this.changed.add(body);
          for (let k = 0; k < 6; k++) this.puff(c.x, c.y, 2, 'smoke');
          this.smokeT[e.car] = 0;
          // the fresh car is put together where it stands, slice by slice
          this.slices.start(c, c.z);
          break;
        }
        case 'sink': {
          // into water too deep to wade: a great splash, and it starts to go under
          this.splash(e.x, e.y, 3);
          if (this.near(e.x, e.y, 320)) S.plop(this.vol(e.x, e.y));
          if (e.car === w.player.index) this.setMsg('TOO DEEP!', 1.2);
          break;
        }
        case 'plunge': {
          // short of the jump and down in the pool under it: a fountain of what the pool is made of
          const pit = w.pits.find((p) => Math.hypot(p.x - e.x, p.y - e.y) < p.r);
          const rgb = pit ? parseInt(pit.def.colour.slice(1, 7), 16) : 0x36b4d2;
          for (let k = 0; k < 16; k++)
            this.spray(e.x + rand(-7, 7), e.y + rand(-7, 7), rgb, 0, 0, 70);
          for (let k = 0; k < 6; k++) this.puff(e.x, e.y, 2, 'smoke');
          if (this.near(e.x, e.y, 320)) S.plop(this.vol(e.x, e.y));
          if (e.car === w.player.index) {
            this.shake = Math.max(this.shake, 4);
            this.setMsg('FELL SHORT!', 1.6);
          } else if (this.near(e.x, e.y, 300)) this.text(e.x, e.y, 'FELL SHORT', '#9fe8ff');
          break;
        }
        case 'rescue': {
          const c = w.cars[e.car]!;
          // gone from where it sat in a burst (out of water, in a last ring of foam), and put
          // together on the road slice by slice
          if ((this.ground.water?.depth(e.x, e.y) ?? 0) > 0) this.splash(e.x, e.y, 1);
          else for (let k = 0; k < 10; k++) this.puff(e.x, e.y, 3, 'smoke');
          this.slices.start(c, c.z);
          if (this.near(c.x, c.y, 320)) S.whoosh();
          if (e.car === w.player.index)
            this.setMsg(e.fell ? 'BACK WHERE YOU LEFT THE ROAD' : 'BACK ON THE ROAD', 1.4);
          else if (this.near(c.x, c.y, 300)) this.text(c.x, c.y, 'LIFTED BACK', '#9fe8ff');
          break;
        }
        case 'scald': {
          // into the lava: a great hiss, a burst of flame and sparks, and it says so
          const c = w.cars[e.car]!;
          const v = this.vol(e.x, e.y);
          if (e.out) {
            if (v > 0) S.hiss(0.3 * v);
            break;
          }
          for (let k = 0; k < 6; k++)
            this.flame(e.x + rand(-7, 7), e.y + rand(-5, 5), c.z, rand(4, 6));
          for (let k = 0; k < 14; k++) this.spark(e.x, e.y, 2, 90);
          for (let k = 0; k < 4; k++) this.plume(e.x + rand(-5, 5), e.y + rand(-5, 5), 4, 5);
          if (v > 0) {
            S.hiss(0.9 * v, true);
            S.hiss(0.6 * v);
          }
          if (e.car === w.player.index) {
            this.setMsg('OUCH! LAVA BURNS', 1.4);
            this.shake = Math.max(this.shake, 3);
          } else if (this.near(c.x, c.y, 300)) this.text(c.x, c.y, 'SIZZLE!', '#ffb03a');
          break;
        }
        case 'land':
          if (e.impact > 90 && this.near(w.cars[e.car]!.x, w.cars[e.car]!.y, 300)) S.crash(10);
          break;
        case 'jolt': {
          // a wheel in a pothole kicks up grit and sparks; a car thrown off a crest leaves dust
          const v = this.vol(e.x, e.y);
          const hole = e.kind === 'hole';
          for (let i = 0; i < (hole ? 5 : 2); i++) this.puff(e.x, e.y, 1, 'dust');
          if (hole) for (let i = 0; i < 8; i++) this.spark(e.x, e.y, 1, 70);
          if (v > 0) S.crash((hole ? 9 : 4) * v);
          if (hole && this.near(e.x, e.y, 60)) this.shake = Math.max(this.shake, 3.5);
          break;
        }
        case 'explode': {
          const { x, y, power } = e;
          const z = e.z ?? 0;
          this.fireball(x, y, power, z);
          this.scar(x, y, power);
          for (let i = 0; i < 16; i++) this.spark(x, y, z + 4, 120);
          if (z < 4) this.scorch(x, y, 16 * power);
          this.flashes.push({ x, y, r: 70 * power + 20, life: 0.45, max: 0.45, rgb: 0xffa040 });
          const v = this.vol(x, y);
          if (v > 0) S.boom(v);
          if (this.near(x, y, 160)) this.shake = Math.max(this.shake, 9 * power * v);
          break;
        }
        case 'strip': {
          // leaves come off a tree: off the side facing a blast, all round when shaken or burnt
          const s = w.statics[e.prop]!;
          const C = s.def.crown;
          if (!C) break;
          let strip = this.scarred.get(s);
          if (!strip) {
            if (this.scarred.size >= MAX_SCARRED) break;
            this.scarred.set(s, (strip = clone(this.art.prop(s.def.id))));
          }
          const dx = e.x - s.x;
          const dy = e.y - s.y;
          const d = Math.hypot(dx, dy) || 1;
          const blast = e.by === 'blast';
          const cs = Math.cos(s.rot);
          const sn = Math.sin(s.rot);
          const off = stripCrown(
            strip,
            C.trunk,
            C.top,
            blast ? (dx * cs + dy * sn) / d : 0,
            blast ? (-dx * sn + dy * cs) / d : 0,
            e.amount / (e.left + e.amount),
            roll,
          );
          this.changed.add(strip);
          if (e.by === 'heat') {
            // burnt off: the crown is in flames, and a few leaves get away alight
            for (let i = 0; i < 3; i++) {
              const c = off[Math.floor(roll() * off.length)];
              if (c) this.flame(s.x + c.x, s.y + c.y, c.z + (s.lift ?? 0), rand(3, 5));
            }
            this.leaves(s, off, 12, 0, 0, 18);
            break;
          }
          // away from the blast, faster the more it tore off; a shaken tree just lets them drop
          const sp = blast ? 60 + 380 * e.amount : 0;
          this.leaves(
            s,
            off,
            blast ? 170 : 60,
            (-dx / d) * sp,
            (-dy / d) * sp,
            blast ? 30 + sp * 0.25 : 14,
          );
          break;
        }
        case 'chip': {
          // a piece knocked out of scenery where it was struck
          const s = w.statics[e.prop]!;
          // a tower keeps its one shared strip (a copy of each would fill the atlas): it shows
          // its damage by the floors it loses, and a knock only throws grit off it
          if (s.def.storeys) {
            this.chipOff(s, e.x, e.y, e.amount);
            break;
          }
          let strip = this.scarred.get(s);
          if (!strip && big(this.art.prop(s.def.id))) {
            // a deck piece is too big to keep a scarred copy of each: it throws grit and dust
            // where it was struck, and shows its damage by coming down
            const z = (s.lift ?? 0) + DECK_SURFACE;
            for (let i = 0; i < 4; i++) this.puff(e.x, e.y, z, 'dust');
            for (let i = 0; i < 6; i++) this.spark(e.x, e.y, z, 70);
            break;
          }
          if (!strip) {
            if (this.scarred.size >= MAX_SCARRED) break;
            this.scarred.set(s, (strip = clone(this.art.prop(s.def.id))));
          }
          const cs = Math.cos(s.rot);
          const sn = Math.sin(s.rot);
          const dx = e.x - s.x;
          const dy = e.y - s.y;
          const part = Math.min(1, e.amount / (s.def.integrity ?? 100));
          const broke = dent(
            strip,
            dx * cs + dy * sn,
            -dx * sn + dy * cs,
            clamp(1.2 + part * s.def.radius * 2.2, 1.2, 7),
            e.by === 'heat' ? 0.35 : 0.9,
            roll,
            e.by === 'heat' ? 1 : 0.4,
          );
          this.changed.add(strip);
          const from = { x: s.x, y: s.y, h: s.rot, z: s.lift ?? 0, ox: e.x, oy: e.y, vx: 0, vy: 0 };
          if (e.by === 'heat') {
            if (roll() < 0.5)
              this.flame(
                e.x + rand(-3, 3),
                e.y + rand(-3, 3),
                (s.lift ?? 0) + rand(3, 9),
                rand(3, 5),
              );
            break;
          }
          this.burst(broke.chips, 50, { ...from, speed: 40 + 60 * part });
          this.burst(broke.loose, 40, { ...from, speed: 25 }, true);
          if (e.by === 'impact') for (let i = 0; i < 3; i++) this.puff(e.x, e.y, 2, 'dust');
          break;
        }
        case 'storey':
          this.collapse(e);
          break;
        case 'topple':
          // a tower tips over. A thing without floors (a span of road) just drops: its 'fall',
          // next, cracks it into slabs and grit where it hung
          if (w.statics[e.prop]!.def.storeys) this.collapse(e);
          break;
        case 'sag': {
          // a bridge gives way: it cracks like a shot, the ground jumps, grit rains off the deck
          const s = w.statics[e.prop]!;
          const v = this.vol(e.x, e.y);
          if (v > 0) this.sound.crash(Math.min(200, 60 + 20 * e.pieces) * v);
          if (this.near(e.x, e.y, 220))
            this.shake = Math.max(this.shake, Math.min(9, 3 + e.pieces * 0.8));
          for (const o of w.sagging) {
            if (o.beam !== s.beam) continue;
            const z = (o.lift ?? 16) + 2;
            for (let i = 0; i < 2; i++)
              this.puff(o.x + rand(-6, 6), o.y + rand(-6, 6), z - rand(0, 6), 'dust');
            for (let i = 0; i < 3; i++) this.spark(o.x + rand(-6, 6), o.y + rand(-6, 6), z, 50);
          }
          break;
        }
        case 'mend':
          // gathered up and started together once this step's events are read
          this.mends.push({ s: w.statics[e.prop]!, in: e.in });
          break;
        case 'stand': {
          const s = w.statics[e.prop]!;
          this.wreck.stand(s);
          for (let i = 0; i < 8; i++) this.spark(s.x, s.y, (s.lift ?? 0) + 2, 60);
          break;
        }
        case 'fall': {
          // it comes down: every voxel it still has flies apart, and rubble marks the spot
          const s = w.statics[e.prop]!;
          // one that fell over bursts where it lands instead (see collapse)
          if (this.toppled.has(s)) break;
          // it goes with the sound of what it was: boards crack, a rail clangs, a pane shatters
          const loud = this.vol(e.x, e.y);
          if (loud > 0) S.knock(this.timbre(s.def.made), 0.5 * loud);
          let strip = this.scarred.get(s) ?? this.art.prop(s.def.id);
          if (s.def.topples) {
            // it does not break up: it tips off what it stood on and falls whole (a loose prop now)
            if (this.scarred.delete(s)) this.dropped.push(strip);
            for (let i = 0; i < 4; i++) this.puff(s.x + rand(-4, 4), s.y + rand(-4, 4), 8, 'dust');
            break;
          }
          if (s.def.crown && s.leaves) {
            // a tree: what leaves it still has drift down while the wood flies apart
            if (!this.scarred.has(s)) strip = clone(strip);
            const C = s.def.crown;
            this.leaves(s, stripCrown(strip, C.trunk, C.top, 0, 0, 1, roll), 220, 0, 0, 30);
          }
          const own = this.scarred.delete(s) || strip !== this.art.prop(s.def.id);
          if (Wreckage.cracks(strip)) {
            // it cracks into pieces that keep their own pixels, and grit from the cracks
            pixels(strip);
            this.wreck.fall({
              o: s,
              strip,
              own,
              mat: s.made?.breaks ?? PLAIN,
              rebuilds: s.def.rebuild !== undefined,
              ox: e.x,
              oy: e.y,
            });
          } else {
            // something small: lumps that break smaller as they land, and bits
            const from = {
              x: s.x,
              y: s.y,
              h: s.rot,
              z: s.lift ?? 0,
              ox: e.x,
              oy: e.y,
              vx: 0,
              vy: 0,
            };
            this.burst(this.chipsOf(strip, !own, strip.res * 4), 60, { ...from, speed: 110 });
            this.burst(this.chipsOf(strip, !own, strip.res * 2), 130, { ...from, speed: 85 });
            this.burst(this.chipsOf(strip, !own, strip.res), 200, { ...from, speed: 65 });
            if (own) this.dropped.push(strip);
          }
          const col = s.made?.colour ?? '#6a6660';
          const r = s.def.radius;
          this.paintGround(s.x, s.y, r + 3, (g) => {
            g.fillStyle = col;
            g.globalAlpha = 0.55;
            for (let i = 0; i < 16; i++) {
              const a = rand(0, TAU);
              const d = rand(0, 1) * (r + 1);
              const q = roll() < 0.3 ? 2 : 1;
              g.fillRect(
                Math.round(s.x + Math.cos(a) * d),
                Math.round(s.y + Math.sin(a) * d),
                q,
                q,
              );
            }
            g.globalAlpha = 1;
          });
          this.puff(s.x + rand(-r, r), s.y + rand(-r, r), rand(1, 6), 'dust');
          const v = this.vol(s.x, s.y);
          if (v > 0) S.crash(6 * v);
          break;
        }
        case 'crater': {
          const { x, y, r } = e;
          const dirt = parseInt(w.venue.colors.dirt.slice(1), 16);
          const top = parseInt(w.venue.colors.ground2.slice(1), 16);
          // the pit: dark in the middle, a lip of thrown-up earth round it, all in single cells
          this.paintGround(x, y, r + 4, (g) => {
            for (let py = Math.floor(y - r - 3); py <= y + r + 3; py++)
              for (let px = Math.floor(x - r - 3); px <= x + r + 3; px++) {
                const d = Math.hypot(px + 0.5 - x, py + 0.5 - y) / r + rand(-0.12, 0.12);
                if (d > 1.28) continue;
                if (d > 1) {
                  if (roll() < 0.55) {
                    g.fillStyle = hex(shade(top, rand(1.12, 1.4)));
                    g.fillRect(px, py, 1, 1);
                  }
                } else {
                  // lit from the top left: the far wall catches the light, the near one is in shade
                  const lit = (px - x + (py - y)) / r;
                  g.fillStyle = hex(shade(dirt, 0.34 + 0.2 * d + 0.14 * lit + rand(-0.04, 0.04)));
                  g.fillRect(px, py, 1, 1);
                }
              }
          });
          // clods of earth thrown out, most of them grit a third of an art px across: they land
          // and stay as specks, and dust hangs over the pit
          const clods: Chip[] = [];
          for (let i = 0; i < r * 10; i++) {
            const a = rand(0, TAU);
            const d = rand(0.2, 1) * r;
            clods.push({
              x: Math.cos(a) * d,
              y: Math.sin(a) * d,
              z: rand(0, 2),
              s: roll() < 0.12 ? 1 : roll() < 0.4 ? 2 / 3 : 1 / 3,
              rgb: shade(dirt, rand(0.6, 1.2)),
            });
          }
          this.burst(clods, 160, {
            x,
            y,
            h: 0,
            z: 0,
            ox: x,
            oy: y,
            speed: 60 + r * 5,
            vx: 0,
            vy: 0,
          });
          for (let i = 0; i < r * 14 * this.quality; i++) {
            const a = rand(0, TAU);
            const v = rand(10, 60);
            this.cells.add(
              CKind.Wisp,
              x + Math.cos(a) * rand(0, r),
              y + Math.sin(a) * rand(0, r),
              rand(0, 4),
              Math.cos(a) * v,
              Math.sin(a) * v,
              rand(20, 90),
              rand(0.6, 1.5),
              shade(dirt, rand(0.9, 1.3)),
            );
          }
          break;
        }
        case 'spill': {
          // a pool poured on the ground: a ragged blot of the material's colour, with a sheen
          const m = w.content.material.get(e.material);
          if (!m) break;
          const { x, y, r } = e;
          this.pool(m, x, y, r);
          for (let i = 0; i < 6; i++) this.puff(x, y, 1, 'dust');
          break;
        }
        case 'quench': {
          // fire put out: the flames stop and steam rolls up
          for (let i = this.fires.length - 1; i >= 0; i--) {
            const f = this.fires[i]!;
            if (Math.hypot(f.x - e.x, f.y - e.y) < e.r + 2) this.fires.splice(i, 1);
          }
          for (let i = 0; i < 10; i++)
            this.plume(
              e.x + rand(-e.r, e.r) * 0.6,
              e.y + rand(-e.r, e.r) * 0.6,
              rand(1, 5),
              rand(4, 7),
              0xd8dde0,
            );
          break;
        }
        case 'launch': {
          for (let i = 0; i < 10; i++) this.spark(e.x, e.y, 3, 90);
          const v = this.vol(e.x, e.y);
          if (v > 0) S.whoosh(v);
          break;
        }
        case 'airburst': {
          const { x, y, z, power } = e;
          this.fireball(x, y, power, z);
          this.flashes.push({ x, y, r: 90 * power + 30, life: 0.5, max: 0.5, rgb: 0xffb050 });
          const v = this.vol(x, y);
          if (v > 0) S.boom(v * 0.8);
          if (this.near(x, y, 160)) this.shake = Math.max(this.shake, 6 * power * v);
          break;
        }
        case 'pop': {
          for (let i = 0; i < 7; i++) this.spark(e.x, e.y, 2, 60);
          for (let i = 0; i < 4; i++) this.flame(e.x, e.y, rand(1, 3), rand(2.5, 4));
          this.scorch(e.x, e.y, 5);
          this.flashes.push({ x: e.x, y: e.y, r: 22, life: 0.18, max: 0.18, rgb: 0xffc060 });
          const v = this.vol(e.x, e.y);
          if (v > 0) S.pop(v);
          break;
        }
        case 'blaze':
          // a pool of burning fuel: it burns for as long as the sim says it does
          this.fires.push({ x: e.x, y: e.y, r: e.r, life: e.life, max: e.life * 0.6 });
          this.scorch(e.x, e.y, e.r + 3);
          break;
        case 'smash': {
          const b = w.bots[e.bot]!;
          const A = this.art.bot(b.def.id, b.paint);
          const sp = Math.hypot(e.vx, e.vy);
          const ux = e.vx / (sp || 1);
          const uy = e.vy / (sp || 1);
          // the bot's body bursts into its pixels, thrown the way the car was going
          this.burst(voxelsOf(A.body), 70, {
            x: e.x,
            y: e.y,
            h: b.h,
            z: 3,
            ox: e.x - ux * 6,
            oy: e.y - uy * 6,
            speed: 50 + sp * 0.5,
            vx: e.vx,
            vy: e.vy,
          });
          for (let i = 0; i < 5; i++)
            this.fling(
              i < 2 ? A.foot : A.chunk,
              e.x,
              e.y,
              3,
              ux * sp * 0.6 + rand(-60, 60),
              uy * sp * 0.6 + rand(-60, 60),
              rand(70, 160),
              rand(0, TAU),
              6,
            );
          for (let i = 0; i < 14; i++) this.spark(e.x, e.y, 5, sp * 0.3);
          for (let i = 0; i < 4; i++) this.puff(e.x, e.y, 4, 'smoke');
          this.splat(e.x, e.y);
          if (e.by === w.player.index) {
            this.text(
              e.x,
              e.y,
              `${pick(['SCRAPPED!', 'CLANK!', 'BOT BOWLED!', 'BOLTS!'])} +${b.def.points}`,
              '#7ff0ff',
            );
            // the score event that follows says the same thing
            smashAt = `${e.x},${e.y}`;
            S.smash();
          } else if (this.near(e.x, e.y, 220)) S.smash();
          break;
        }
        case 'bot-spawn': {
          const b = w.bots[e.bot]!;
          place(this.walkers[e.bot]!, b.x, b.y, b.h);
          this.slices.start(b);
          break;
        }
        case 'break':
          // the crate itself bursts into voxels in afterStep, like any prop that dies
          for (let i = 0; i < 4; i++) this.puff(e.x, e.y, 4, 'smoke');
          if (this.near(e.x, e.y, 250)) S.crash(20);
          break;
        case 'pickup':
          for (let i = 0; i < 8; i++) this.spark(e.x, e.y, 6, 30);
          if (e.car === w.player.index) {
            this.text(e.x, e.y, e.label, '#a6fbff');
            if (e.kind === 'repair' || e.kind === 'cash' || e.kind === 'weld') S.repair();
            else if (e.kind === 'nitro') S.nitro();
            else S.pickup(e.kind);
          }
          break;
        case 'blade': {
          const c = w.cars[e.car]!;
          const v = this.vol(e.x, e.y);
          if (v > 0) S.clang(v);
          for (let i = 0; i < 6; i++) this.spark(e.x, e.y, 3, 40);
          // a worn-out blade drops off the nose and tumbles away
          if (!e.on)
            this.fling(
              this.art.prop(e.id),
              e.x,
              e.y,
              2,
              c.vx * 0.5 + rand(-20, 20),
              c.vy * 0.5 + rand(-20, 20),
              rand(50, 90),
              c.h,
              5,
            );
          break;
        }
        case 'hop': {
          // the springs kick off the ground: a scuff of dust behind the wheels
          const c = w.cars[e.car]!;
          for (let i = 0; i < 6; i++) this.puff(e.x, e.y, 1, 'dust', -c.vx * 0.15, -c.vy * 0.15);
          const v = this.vol(e.x, e.y);
          if (v > 0) S.boing(v);
          break;
        }
        case 'touchdown': {
          // the car comes down in a ring of dust thrown out along the ground, single cells
          const c = w.cars[e.car]!;
          const k = clamp(e.impact / 120, 0.5, 1.4);
          const n = Math.round(16 * k * this.quality) + 4;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + rand(-0.2, 0.2);
            const sp = rand(25, 55) * k;
            this.puff(
              e.x + Math.cos(a) * 7,
              e.y + Math.sin(a) * 5,
              0.5,
              'dust',
              Math.cos(a) * sp + c.vx * 0.3,
              Math.sin(a) * sp + c.vy * 0.3,
            );
          }
          const v = this.vol(e.x, e.y);
          if (v > 0) S.thud(v * k);
          if (c === w.player) this.shake = Math.max(this.shake, 3 * k);
          break;
        }
        case 'shot': {
          // the barrels of a car's nose gun fire in turn: the round leaves the one whose go it is
          const c = w.cars[e.car];
          let x = e.x;
          let y = e.y;
          // as high as the barrel's mouth is on this car, wherever the car is (in the air, up on
          // a deck), and down the line to the height of what it strikes
          let z = 5;
          let tz = 5;
          if (c && c.gun) {
            const last = this.gunShots.get(c.index);
            const side = last ? -last.side : 1;
            this.gunShots.set(c.index, { side, at: w.time });
            const mount = this.art.gunMount(c.def.id, c.def.body);
            const off = side * mount[1] * c.size;
            z = tz = c.z + (BODY_UP + mount[2] + 1.3) * c.size;
            const o = e.hit >= 0 ? w.cars[e.hit] : undefined;
            if (o) tz = o.z + 4 * o.size;
            x -= Math.sin(c.h) * off;
            y += Math.cos(c.h) * off;
          }
          // a line of tracer all the way down the line of fire, hottest at the muzzle
          const dx = e.tx - x;
          const dy = e.ty - y;
          const d = Math.hypot(dx, dy) || 1;
          const ux = dx / d;
          const uy = dy / d;
          const n = Math.ceil(d / 2.5);
          for (let i = 0; i <= n; i++) {
            const k = i / n;
            this.emit(
              'glitter',
              x + dx * k,
              y + dy * k,
              z + (tz - z) * k,
              ux * 30,
              uy * 30,
              0,
              rand(0.07, 0.12),
              k < 0.25 ? 2 : 1.4,
              k < 0.2 ? 0xffffff : i % 2 ? 0xfff0a0 : 0xffb040,
            );
          }
          // a burst of flame out of the muzzle, a flash that lights the ground, a case thrown clear
          for (let i = 0; i < 9; i++) {
            const a = Math.atan2(uy, ux) + rand(-0.6, 0.6);
            const sp = rand(30, 120);
            this.emit(
              'glitter',
              x + ux * 1.5,
              y + uy * 1.5,
              z,
              Math.cos(a) * sp,
              Math.sin(a) * sp,
              rand(0, 20),
              rand(0.08, 0.16),
              i < 3 ? 3 : 2,
              i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0xffd050 : 0xff8a20,
            );
          }
          this.emit(
            'glitter',
            x,
            y,
            z + 1,
            -uy * rand(25, 50),
            ux * rand(25, 50),
            70,
            0.4,
            1.4,
            0xe0a830,
          );
          this.flashes.push({ x, y, r: 34, life: 0.1, max: 0.1, rgb: 0xffd070 });
          if (e.hit >= 0) {
            // the round strikes: a white burst on the bodywork, hot bits thrown off it, a flash
            for (let i = 0; i < 12; i++) {
              const a = rand(0, TAU);
              const sp = rand(25, 110);
              this.emit(
                'glitter',
                e.tx,
                e.ty,
                tz,
                Math.cos(a) * sp - ux * 30,
                Math.sin(a) * sp - uy * 30,
                rand(20, 80),
                rand(0.12, 0.3),
                i < 4 ? 2.6 : 1.6,
                i < 4 ? 0xffffff : i % 2 ? 0xffe070 : 0xff7a20,
              );
            }
            for (let i = 0; i < 4; i++) this.spark(e.tx, e.ty, tz - 1, 70);
            this.flashes.push({ x: e.tx, y: e.ty, r: 24, life: 0.1, max: 0.1, rgb: 0xfff0c0 });
            if (e.hit === w.player.index) this.shake = Math.max(this.shake, 1.2);
          }
          // a miss kicks up the ground where it lands
          else
            for (let i = 0; i < 3; i++)
              this.puff(e.tx + rand(-2, 2), e.ty + rand(-2, 2), (c ? c.deck : 0) + 0.6, 'dust');
          const vol = this.vol(e.x, e.y);
          if (vol > 0) S.gun(vol);
          break;
        }
        case 'rail':
        case 'lightning':
        case 'orb':
        case 'stick':
        case 'pass':
        case 'splash':
          armsEvent(this, w, e, S);
          break;
        case 'fire': {
          const c = w.cars[e.car]!;
          const wpn = w.content.weapon.get(e.weapon);
          if (armsEvent(this, w, e, S) || arsenalEvent(this, w, e, S)) break;
          if (wpn?.kind === 'rocket') {
            if (this.vol(c.x, c.y) > 0) S.fire();
          } else if (c === w.player && wpn?.kind !== 'pulse' && wpn?.kind !== 'howl') S.drop();
          break;
        }
        case 'puncture': {
          dropEvent(this, w, e);
          const vol = this.vol(e.x, e.y);
          if (vol > 0) S.pop(vol);
          if (e.car === w.player.index) this.text(e.x, e.y, 'FLAT TYRE', '#ff6a3d');
          break;
        }
        case 'score':
          if (e.car === w.player.index && `${e.x},${e.y}` !== smashAt) {
            const big = e.label.startsWith('WRECKED');
            this.text(e.x, e.y, e.label, big ? '#ff6a3d' : '#ffd24a', big);
          }
          break;
        case 'pad':
        case 'bounce':
        case 'critter':
        case 'trample':
          this.life.handle(this, w, e, S, this.art);
          break;
        case 'pulse':
        case 'arc':
        case 'stall':
          this.shock.handle(e);
          break;
        case 'crack':
        case 'frost':
        case 'meteor':
        case 'pit':
        case 'trap':
        case 'fill':
        case 'unpit':
        case 'buried':
          wildEvent(this, w, e, S);
          break;
        case 'guard':
          guardEvent(this, w, e, S);
          break;
        case 'catchup':
          this.catchup.handle(this, w, e, S, this.art);
          break;
        case 'trick':
          this.tricks.handle(this, w, e, S, this.art);
          break;
        case 'haunt':
          if (e.on) {
            // the wreck gets up whole: its body is painted back into the same strip, as for a
            // car towed back, and put together where it stands
            const c = w.cars[e.car]!;
            const body = this.bodies[e.car]!;
            this.heavy.settle(body);
            restore(body, this.carArt(c).body);
            pale(body);
            this.changed.add(body);
            this.smokeT[e.car] = 0;
            this.slices.start(c, c.z);
          }
          this.tricks.haunt(this, w, e, S);
          break;
        case 'spook':
          this.tricks.haunt(this, w, e, S);
          break;
        case 'catch':
        case 'leash':
        case 'snap':
        case 'incoming':
        case 'sentry':
        case 'flea':
        case 'beam':
        case 'swap':
        case 'fizz':
          arsenalEvent(this, w, e, S);
          break;
        case 'howl':
        case 'hurl':
          howlEvent(this, w, e, S);
          break;
        case 'weather':
        case 'omen':
        case 'bolt':
        case 'skyfall':
        case 'quake':
        case 'split':
        case 'gust':
        case 'flood':
          this.weather.handle(e);
          break;
        case 'countdown':
          S.beep(false);
          break;
        case 'go':
          S.beep(true);
          this.setMsg('GO!', 0.9);
          break;
        case 'final-lap':
          this.setMsg('FINAL LAP', 1.6);
          if (e.car === w.player.index) S.jingle('final-lap');
          break;
        case 'finish':
          if (e.car === w.player.index) {
            this.setMsg(e.place === 1 ? 'YOU WIN!' : 'FINISHED', 2.4);
            S.jingle(e.place === 1 ? 'win' : e.place <= 3 ? 'podium' : 'finish');
          }
          break;
        case 'over':
          break;
      }
    }
    if (w.kind === 'derby' && w.endT > 0 && !this.endShown) {
      this.endShown = true;
      if (!w.player.wrecked) {
        const last = w.cars.filter((c) => !c.wrecked).length <= 1;
        this.setMsg(last ? 'LAST DOG STANDING!' : 'TIME!', 3);
        S.jingle(last ? 'last-standing' : 'finish');
      }
    }
  }
  private endShown = false;

  private carBurst(c: Car): Omit<Burst, 'ox' | 'oy' | 'speed'> {
    return { x: c.x, y: c.y, h: c.h, z: c.z + 0.6, vx: c.vx, vy: c.vy };
  }

  /**
   * Send up to `max` of these chips flying (the rest just vanish), within the overall budget.
   * `asOne` throws them all the same way, so a piece cut loose travels as a piece until it lands.
   */
  private burst(chips: Chip[], max: number, b: Burst, asOne = false): void {
    const room = Math.max(0, MAX_VOXELS - this.voxels.length);
    const n = pickSome(chips, Math.min(max, room), roll);
    if (asOne) for (const v of launchTogether(chips, b, roll, n)) this.voxels.push(v);
    else for (let i = 0; i < n; i++) this.voxels.push(launch(chips[i]!, b, roll));
  }

  /** A loose block that has stopped becomes a mark on the ground: a crumb a speck, a block its own size. */
  private soak(vx: number, vy: number, size: number, rgb: number): void {
    const g = this.ground.g;
    const [x, y] = this.w.keepInside(vx, vy, 1);
    const d = Math.max(1, Math.round(size));
    g.globalAlpha = Math.min(1, 0.35 + size * 0.65);
    g.fillStyle = `rgb(${((rgb >> 16) & 255) * 0.8},${((rgb >> 8) & 255) * 0.8},${(rgb & 255) * 0.8})`;
    g.fillRect(Math.floor(x - d / 2 + 0.5), Math.floor(y - d / 2 + 0.5), d, d);
    g.globalAlpha = 1;
    markGround(this.ground, x, y, d);
  }

  /** Per tick: walk the bots, lay skid marks, puff smoke from damaged cars, age everything. */
  /** A building loses its top floor, or falls over. */
  private collapse(e: Extract<SimEvent, { t: 'storey' | 'topple' }>): void {
    const s = this.w.statics[e.prop]!;
    const base = this.art.prop(s.def.id);
    const floor = s.def.fallOver?.floor ?? 4;
    const v = this.vol(s.x, s.y);
    if (e.t === 'storey') {
      // the floor that went flies off in its blocks, with a cloud of grit at that height
      const z0 = e.left * floor;
      this.burst(floorOf(this.chipsOf(base), z0, z0 + floor + 1), 140, {
        x: s.x,
        y: s.y,
        h: s.rot,
        z: 0,
        ox: e.x,
        oy: e.y,
        speed: 45,
        vx: 0,
        vy: 0,
      });
      for (let i = 0; i < 4; i++)
        this.puff(s.x + rand(-4, 4), s.y + rand(-4, 4), z0 + rand(0, floor), 'dust');
      if (v > 0) this.sound.crash(3 * v);
      return;
    }
    const strip = this.scarred.get(s) ?? base;
    const layers = s.def.storeys
      ? Math.min(strip.n, Math.round(e.left * floor * strip.res))
      : strip.n;
    this.toppled.add(s);
    this.toppling.push({ s, strip, layers, a: e.a, len: e.len, t: 0, dur: fallTime(e.len) });
    for (let i = 0; i < 6; i++) this.puff(s.x + rand(-5, 5), s.y + rand(-5, 5), rand(0, 4), 'dust');
  }

  /** Grit off a tower where it was struck: a handful of its blocks from around that height. */
  private chipOff(s: StaticProp, x: number, y: number, amount: number): void {
    const n = s.storeys ?? 1;
    const top = n * (s.def.fallOver?.floor ?? 4);
    const z = rand(0, top);
    const bits = floorOf(this.chipsOf(this.art.prop(s.def.id)), z - 3, z + 3);
    this.burst(bits, Math.round(Math.min(60, 8 + amount)), {
      x: s.x,
      y: s.y,
      h: s.rot,
      z: 0,
      ox: x,
      oy: y,
      speed: 40,
      vx: 0,
      vy: 0,
    });
    this.puff(x, y, z, 'dust');
  }

  /** Falling buildings tip further; one that hits the ground bursts along where it lies. */
  private fallen(): void {
    for (let i = this.toppling.length - 1; i >= 0; i--) {
      const T = this.toppling[i]!;
      T.t += DT;
      if (T.t < T.dur) continue;
      this.toppling.splice(i, 1);
      const s = T.s;
      const height = T.layers / T.strip.res;
      const chips = floorOf(this.chipsOf(this.art.prop(s.def.id)), 0, height);
      this.burst(laidOut(chips, T.a, s.rot, height, T.len), 320, {
        x: s.x,
        y: s.y,
        h: s.rot,
        z: 0,
        ox: s.x,
        oy: s.y,
        speed: 28,
        vx: Math.cos(T.a) * 30,
        vy: Math.sin(T.a) * 30,
      });
      const cs = Math.cos(T.a);
      const sn = Math.sin(T.a);
      for (let d = 0; d < T.len; d += 5)
        this.puff(s.x + cs * d + rand(-4, 4), s.y + sn * d + rand(-4, 4), rand(0, 5), 'dust');
      const v = this.vol(s.x, s.y);
      if (v > 0) {
        this.sound.crash(9 * v);
        this.shake = Math.max(this.shake, 5 * v);
      }
      if (this.scarred.get(s) === T.strip) {
        this.scarred.delete(s);
        this.dropped.push(T.strip);
      }
    }
  }

  afterStep(): void {
    const w = this.w;
    this.weather.tick();
    // a weld is planned from the body as it stands: with every dent it is owed
    if (this.heavy.waiting)
      for (const c of w.cars) if (c.weldT > 0) this.heavy.settle(this.bodies[c.index]!);
    this.defence.afterStep();
    this.addons.afterStep();
    this.fallen();
    this.wreck.step(DT, w.cars);
    for (const b of w.bots) if (b.alive) step(this.walkers[b.index]!, b.x, b.y, b.h, DT);
    // a prop that died this tick (a smashed crate, a barrel going up) bursts into its voxels
    for (const p of w.props) {
      if (!p.alive && this.propAlive[p.index] !== false) {
        const boom = p.def.explodesAt !== undefined;
        this.burst(this.chipsOf(this.art.prop(p.def.id)), boom ? 260 : 200, {
          x: p.x,
          y: p.y,
          h: p.rot,
          z: p.z,
          ox: p.x,
          oy: p.y,
          speed: boom ? 150 : 80,
          vx: p.vx,
          vy: p.vy,
        });
      }
      this.propAlive[p.index] = p.alive;
    }
    // loose blocks fly and bounce. One that lands hard breaks into smaller ones while there is
    // room for them; one that stops is painted into the ground for good.
    const W = this.wreck;
    for (let i = this.voxels.length - 1; i >= 0; i--) {
      const v = this.voxels[i]!;
      // rubble lands on the rubble that is there, and light grit rides the wind on the way down
      const floor = v.pile && v.z < 48 ? W.floor(v.x, v.y) : 0;
      if (v.drift && v.z > floor + 0.5) {
        v.vx += (WIND[0] * 2.5 - v.vx) * v.drift * DT * 1.2;
        v.vy += (WIND[1] * 2.5 - v.vy) * v.drift * DT * 1.2;
      }
      const fate = stepVoxel(v, DT, floor);
      if (fate === 'fly') continue;
      if (fate === 'split') {
        if (this.voxels.length + 8 > MAX_VOXELS) continue;
        const bits = shards(v, roll);
        for (const b of bits) {
          b.z += floor;
          if (v.pile) b.pile = true;
          if (v.home) b.home = v.home;
          if (v.drift) b.drift = v.drift;
        }
        this.voxels[i] = bits[0]!;
        for (let k = 1; k < bits.length; k++) this.voxels.push(bits[k]!);
        continue;
      }
      // it has stopped: rubble stays as a grain on the heap, anything else soaks into the ground
      if (!W.settle(v)) this.soak(v.x, v.y, v.s, v.rgb);
      this.voxels[i] = this.voxels[this.voxels.length - 1]!;
      this.voxels.pop();
    }
    w.cars.forEach((c, i) => {
      const cs = Math.cos(c.h);
      const sn = Math.sin(c.h);
      // the car draws on the world: its back wheels lay a line each wherever it slides, and all
      // the way over soft ground (grass, dirt, sand, snow), so a chase can be read off the ground
      // after it has gone by. Up on a deck or in the air there is no ground under it to mark.
      const soft = c.offroad && Math.abs(c.vf) > 14;
      const down = c.deck < 1 && c.z - c.deck < 0.5 && !c.wrecked;
      const last = (this.ruts[i] ??= [0, 0, 0, 0, 0]);
      // in water there is no ground to mark and no dust to raise: it wades, with a wake
      // (nor on lava or ice: it burns, or throws up chips of ice)
      const wet = this.wade(c, i, cs, sn) || this.poolFx(c, i, cs, sn);
      if (wet) last[4] = 0;
      else if (down && (c.sliding || soft)) {
        const g = this.ground.g;
        let spray = 0x8a8680;
        if (c.offroad) {
          // a shade of the ground itself, deeper and a little blue: a rut in whatever it is
          const [r, gr, b] = this.ground.tone(c.x, c.y);
          g.strokeStyle = `rgba(${Math.round(r * 0.3)},${Math.round(gr * 0.33)},${Math.round(b * 0.48)},${c.sliding ? 1 : 0.85})`;
          spray =
            (Math.min(255, Math.round(r * 1.12 + 10)) << 16) |
            (Math.min(255, Math.round(gr * 1.12 + 10)) << 8) |
            Math.min(255, Math.round(b * 1.12 + 10));
        } else g.strokeStyle = 'rgba(18,16,14,0.6)';
        g.lineWidth = Math.max(1.5, 2 * c.size);
        g.lineCap = 'round';
        for (const sgn of [-1, 1]) {
          const wx = -7 * c.size;
          const wy = 5.4 * sgn * c.size;
          const mx = c.x + cs * wx - sn * wy;
          const my = c.y + sn * wx + cs * wy;
          const o = sgn < 0 ? 0 : 2;
          // from where this wheel was a tick ago (or a dot, where the line starts or jumped)
          const joined = last[4] === 1 && Math.hypot(mx - last[o]!, my - last[o + 1]!) < 14;
          g.beginPath();
          g.moveTo(joined ? last[o]! : mx, joined ? last[o + 1]! : my);
          g.lineTo(mx, my + 0.01);
          g.stroke();
          markGround(this.ground, mx, my, 3);
          last[o] = mx;
          last[o + 1] = my;
          // and what the wheel digs out flies off behind it, wide in a slide
          if (c.offroad && roll() < (c.sliding ? 0.9 : Math.min(0.6, Math.abs(c.vf) / 260)))
            this.spray(mx, my, spray, c.vx, c.vy, c.sliding ? 46 : 22);
        }
        last[4] = 1;
      } else last[4] = 0;
      if (!wet && c.sliding && roll() < 0.3) this.puff(c.x - cs * 9, c.y - sn * 9, 1, 'smoke');
      if (!wet && c.offroad && Math.abs(c.vf) > 50 && roll() < 0.25)
        this.puff(c.x - cs * 9, c.y - sn * 9, 1, 'dust');
      if (!c.buried && !c.haunt && !((c.sunk ?? 0) > 0) && (c.wrecked || c.hp < 45)) {
        const t = (this.smokeT[i] ?? 0) - DT;
        this.smokeT[i] = t;
        if (t <= 0) {
          this.smokeT[i] = c.wrecked ? 0.05 : c.hp < 25 ? 0.07 : 0.16;
          // the engine: a hurt one trails grey smoke, a dying one burns under a black column
          const ex = c.x + cs * 6 + rand(-2, 2);
          const ey = c.y + sn * 6 + rand(-2, 2);
          const burning = c.wrecked || c.hp < 20;
          this.plume(ex, ey, c.z + 6, burning ? rand(4, 6) : rand(2.5, 4), burning ? SOOT : HAZE);
          if (burning) {
            this.flame(ex, ey, c.z + 5, rand(3, 5.5), c.vx * 0.5, c.vy * 0.5);
            if (roll() < 0.25) this.ember(ex, ey, c.z + 7);
          }
        }
      }
    });
    // a burst drum climbs on a jet of fire and leaves a column of smoke under it
    for (const p of w.props) {
      if (!p.alive || !p.flying) continue;
      for (let n = 0; n < 3; n++)
        this.flame(
          p.x + rand(-1.5, 1.5),
          p.y + rand(-1.5, 1.5),
          p.z - 2,
          rand(3, 5.5),
          0,
          0,
          -rand(30, 80),
        );
      this.plume(p.x, p.y, p.z - 3, 3.5, HAZE, 4);
      if (roll() < 0.5) this.spark(p.x, p.y, p.z, 30);
    }
    // burning bits falling out of a burst: stars glitter, fuel burns and smokes on its way down
    for (const e of w.embers) {
      if (e.kind === 'star') {
        this.emit(
          'glitter',
          e.x,
          e.y,
          e.z,
          rand(-6, 6),
          rand(-6, 6),
          rand(-10, 10),
          rand(0.15, 0.35),
          1,
          roll() < 0.5 ? 0xfff0a0 : 0xffa020,
        );
        if (roll() < 0.35) this.flame(e.x, e.y, e.z, rand(1.5, 2.5), 0, 0, 0);
      } else {
        this.flame(e.x, e.y, e.z, rand(2.5, 4), 0, 0, 0);
        if (roll() < 0.4) this.plume(e.x, e.y, e.z, 2.5, SOOT, 6);
      }
    }
    // a rocket rides a tail of fire and leaves a thin smoke trail
    for (const r of w.rockets) {
      // bomblets (rockets that arm late, thrown out of a cluster) ride a smaller flame
      const small = r.def.arm !== undefined;
      const bx = r.x - Math.cos(r.h) * (small ? 2 : 5);
      const by = r.y - Math.sin(r.h) * (small ? 2 : 5);
      this.flame(bx, by, 5, small ? rand(1, 1.8) : rand(2, 3.5), 0, 0, 0);
      if (roll() < (small ? 0.25 : 0.6)) this.plume(bx, by, 5, small ? 1.5 : 2.5, HAZE, 6);
      // a seeker paints its target: a ring of red cells turning round the car it is chasing
      const tg = r.target !== undefined ? w.cars[r.target] : undefined;
      // (every few ticks, cells that last a few frames, so slow phones still see it)
      if (tg && !tg.wrecked && w.tick % 3 === 0) {
        const spin = w.tick * DT * 5;
        for (let k = 0; k < 4; k++) {
          const a = spin + (k * TAU) / 4;
          for (const d of [-0.18, 0, 0.18])
            this.emit(
              'glitter',
              tg.x + Math.cos(a + d) * 14,
              tg.y + Math.sin(a + d) * 14,
              tg.z + 6,
              0,
              0,
              0,
              0.14,
              1,
              0xff3a2e,
            );
        }
      }
    }
    // fires left by explosions burn down: flames, then mostly smoke
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i]!;
      f.life -= DT;
      if (f.life <= 0) {
        this.fires.splice(i, 1);
        continue;
      }
      const k = f.life / f.max;
      const a = rand(0, TAU);
      const d = rand(0, f.r);
      const x = f.x + Math.cos(a) * d;
      const y = f.y + Math.sin(a) * d;
      for (let n = 0; n < 2; n++)
        if (roll() < k + 0.2)
          this.flame(x + rand(-2, 2), y + rand(-2, 2), rand(1, 4), rand(4, 7) * (0.5 + k * 0.5));
      if (roll() < 0.45) this.plume(x, y, rand(5, 10), rand(4, 7));
      if (roll() < 0.2) this.ember(x, y, 5);
    }
    armsTick(this, w, this.sound);
    arsenalTick(this, w, this.sound);
    this.feed();
    feedClouds(this, w);
    // the cars drag the air they drive through: fire and smoke near a fast car swirl in its wake
    const M = this.cells.movers;
    M.length = 0;
    for (const c of w.cars) if (c.vx * c.vx + c.vy * c.vy > 625) M.push(c.x, c.y, c.z, c.vx, c.vy);
    this.cells.step(DT);
    this.shock.step(DT);
    howlTick(this, w);
    guardTick(this, w, this.sound);
    this.catchup.step(this, w, this.sound);
    this.tricks.step(this, w);
    this.life.step(this, w);
    // hollows in the road are light and shade on the ground: each painted once, as it is laid
    for (; this.hollows < w.mounds.length; this.hollows++) {
      const s = w.mounds[this.hollows]!;
      if (s.def.mound!.high < 0 && s.def.mound!.shape === 'bar') paintHollow(this.ground, s);
    }
    this.leafFall();
    this.litter();
    for (let i = this.fx.length - 1; i >= 0; i--) {
      if (stepParticle(this.fx[i]!, DT)) continue;
      this.spent.push(this.fx[i]!);
      this.fx[i] = this.fx[this.fx.length - 1]!;
      this.fx.pop();
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]!;
      d.life -= DT;
      if (d.life <= 0) {
        this.debris.splice(i, 1);
        continue;
      }
      d.x += d.vx * DT;
      d.y += d.vy * DT;
      d.rot += d.spin * DT;
      d.vz -= 420 * DT;
      d.z += d.vz * DT;
      if (d.z <= 0) {
        d.z = 0;
        d.vz = d.vz < -60 ? -d.vz * 0.3 : 0;
        const f = Math.exp(-5 * DT);
        d.vx *= f;
        d.vy *= f;
        d.spin *= f;
      }
      [d.x, d.y] = w.keepInside(d.x, d.y, 2);
    }
    if (this.debris.length > 160) this.debris.splice(0, this.debris.length - 160);
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]!;
      t.life -= DT;
      t.z += 14 * DT;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!;
      f.life -= DT;
      if (f.life <= 0) this.flashes.splice(i, 1);
    }
    this.msgT -= DT;
    this.shake *= Math.exp(-8 * DT);
  }
}
