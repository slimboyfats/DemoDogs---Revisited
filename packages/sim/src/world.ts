import {
  DT,
  FIELD_SIZE,
  NO_CONTROLS,
  type Controls,
  type ModeManifest,
  type SimEvent,
  type VenueManifest,
  type MaterialManifest,
  type WeaponManifest,
} from '@demodogs/shared';
import type { Content } from './content';
import type {
  Blaze,
  Bot,
  Car,
  Crater,
  Ember,
  Entrant,
  LooseProp,
  Mine,
  Pickup,
  Rocket,
  Setup,
  Spill,
  StaticProp,
} from './entities';
import { Hasher, TAU, angDiff, clamp } from './math';
import { Rng } from './prng';
import { DistanceGrid, sampleTrack, type Track } from './track';
import { buildScenery } from './scenery';
import { collideCars, collideProps, collideWorld, drive, makeCar } from './physics';
import { respawn, updateEmbers } from './damage';
import {
  fire,
  makeBot,
  spawnBot,
  updateBot,
  updateMines,
  updatePickups,
  updateProps,
  shoot,
  updateRockets,
} from './things';
import { standings, trackIndex } from './race';
import { newArms, updateArms, type Arms } from './arms';

export interface WorldOptions {
  content: Content;
  venue: string;
  /** The player's car type. */
  car: string;
  seed: number;
  /** The player's car is driven by the mode's AI (tests, demos). */
  autopilot?: boolean;
  /** Rivals in the field (default: fill to FIELD_SIZE). */
  rivals?: number;
  /** The rivals by name, front of the grid first, instead of a drawn field. */
  field?: Entrant[];
  /** The player's upgrades and extras. */
  player?: Setup;
  /** A wrecked car is out for good, and the race ends when the player is. */
  knockout?: boolean;
  /** Laps, instead of the mode's. */
  laps?: number;
  /**
   * A test range: no countdown and no end, and the rivals are parked targets that nobody drives.
   * See range.ts for what can be done to them.
   */
  sandbox?: boolean;
}

export interface Oval {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export type Phase = 'countdown' | 'race' | 'over';

const RIVAL_PAINTS = [
  '#4fbf6a',
  '#9b5bd6',
  '#e45fa8',
  '#34b6c2',
  '#8a8f99',
  '#f08c2a',
  '#5a6cf0',
  '#c9d23a',
];
const RIVAL_NAMES = ['REX', 'BISCUIT', 'FANG', 'DOZER', 'GNASHER', 'SCRAPS', 'BONES', 'TANK'];
const COUNTDOWN = 3.6;

/**
 * A whole race or derby. The world is a pure function of its options and the player's controls:
 * step() advances one 1/60 s tick, and everything random comes from `rng`. It reports what happened
 * as events (takeEvents) for the client to draw and play.
 */
export class World {
  readonly content: Content;
  readonly venue: VenueManifest;
  readonly mode: ModeManifest;
  readonly rng: Rng;
  readonly w: number;
  readonly h: number;
  readonly track: Track | null = null;
  readonly grid: DistanceGrid | null = null;
  readonly oval: Oval | null = null;
  readonly road: number;
  readonly knockout: boolean;
  readonly sandbox: boolean;
  /** The gun every car carries: the pack's gun, if it has one. */
  readonly gun: WeaponManifest | null;
  private readonly lapsOpt: number | undefined;
  readonly cars: Car[] = [];
  readonly bots: Bot[] = [];
  readonly statics: StaticProp[] = [];
  readonly props: LooseProp[] = [];
  readonly rockets: Rocket[] = [];
  readonly mines: Mine[] = [];
  readonly pickups: Pickup[] = [];
  /** Burning bits in the air, and pools of fire on the ground. */
  readonly embers: Ember[] = [];
  readonly blazes: Blaze[] = [];
  /** Pits blasts have dug in the ground. */
  readonly craters: Crater[] = [];
  /** Pools of oil, fuel, water and the like on the ground. */
  readonly spills: Spill[] = [];
  /** Sprays, rail slugs, wrecking balls, fire shells and sticky bombs in play. */
  readonly arms: Arms = newArms();
  /** What a wrecked car leaks: the pack's material that says so, if any. */
  readonly leak: MaterialManifest | null;
  readonly player: Car;
  /** Car indices in finishing order. */
  readonly finishers: number[] = [];
  phase: Phase = 'countdown';
  tick = 0;
  countdown = COUNTDOWN;
  raceTime = 0;
  timeLeft = 0;
  /** Seconds until the result screen, once the end is decided; -1 before. */
  endT = -1;
  private events: SimEvent[] = [];
  private lastBeep = 4;

  constructor(opts: WorldOptions) {
    const C = opts.content;
    const venue = C.venue.get(opts.venue);
    if (!venue) throw new Error(`no venue ${opts.venue}`);
    const mode = C.mode.get(venue.mode)!;
    const carDef = C.car.get(opts.car);
    if (!carDef) throw new Error(`no car ${opts.car}`);
    this.content = C;
    this.venue = venue;
    this.mode = mode;
    this.rng = new Rng(opts.seed);
    this.w = venue.size.w;
    this.h = venue.size.h;
    this.road = venue.track?.road ?? 0;
    this.knockout = opts.knockout ?? false;
    this.sandbox = opts.sandbox ?? false;
    this.leak =
      [...C.material.values()]
        .filter((d) => d.wreck !== undefined)
        .sort((a, b) => (a.id < b.id ? -1 : 1))[0] ?? null;
    this.gun =
      [...C.weapon.values()]
        .filter((d) => d.kind === 'gun')
        .sort((a, b) => (a.id < b.id ? -1 : 1))[0] ?? null;
    if (this.sandbox) this.phase = 'race';
    this.lapsOpt = opts.laps;
    if (venue.track) {
      this.track = sampleTrack(venue.track.points, 4);
      this.grid = new DistanceGrid(this.track, this.w, this.h, 6, this.road / 2 + 80);
    }
    if (venue.oval) this.oval = { ...venue.oval };
    this.timeLeft = mode.timeLimit ?? 0;
    buildScenery(this, new Rng(venue.seed));

    // the field: the player and rivals in other cars and paint
    const types = [...C.car.keys()].sort();
    const aiDef = C.ai.get(mode.ai)!;
    const paints = this.rng.shuffle(RIVAL_PAINTS);
    const names = this.rng.shuffle(RIVAL_NAMES);
    const player = makeCar(
      this,
      carDef,
      carDef.paint,
      'YOU',
      true,
      opts.autopilot ? aiDef : null,
      opts.player,
    );
    const rivals: Car[] = [];
    for (const e of opts.field ?? []) {
      const def = C.car.get(e.car);
      if (!def) throw new Error(`no car ${e.car}`);
      rivals.push(makeCar(this, def, e.paint, e.name, false, this.sandbox ? null : aiDef, e));
    }
    const count = opts.field ? 0 : (opts.rivals ?? FIELD_SIZE - 1);
    for (let i = 0; i < count; i++) {
      const t = types[(types.indexOf(opts.car) + 1 + i) % types.length]!;
      rivals.push(
        makeCar(
          this,
          C.car.get(t)!,
          paints[i % paints.length]!,
          names[i % names.length]!,
          false,
          this.sandbox ? null : aiDef,
        ),
      );
    }
    if (mode.kind === 'race' && this.track) {
      const order = [...rivals.slice(0, 3), player, ...rivals.slice(3)];
      order.forEach((c, k) => this.placeOnTrack(c, this.gridSlot(k), k % 2 ? 1 : -1));
      this.cars.push(...order);
      for (let q = 1; q <= 4; q++) {
        const T = this.track;
        const i = Math.floor((T.n * q) / 4.6) % T.n;
        const a = T.a[i]!;
        for (let k = -1; k <= 1; k++)
          this.pickups.push({
            x: T.x[i]! - Math.sin(a) * k * this.road * 0.3,
            y: T.y[i]! + Math.cos(a) * k * this.road * 0.3,
            on: true,
            t: 0,
          });
      }
    } else if (this.oval) {
      const O = this.oval;
      const all = [player, ...rivals];
      all.forEach((c, k) => {
        const t = (k / all.length) * TAU + 0.3;
        c.x = O.cx + Math.cos(t) * O.rx * 0.7;
        c.y = O.cy + Math.sin(t) * O.ry * 0.7;
        c.h = t + Math.PI;
      });
      this.cars.push(...all);
      for (let k = 0; k < 8; k++) {
        const t = (k / 8) * TAU + 0.2;
        const q = k % 2 ? 0.35 : 0.62;
        this.pickups.push({
          x: O.cx + Math.cos(t) * O.rx * q,
          y: O.cy + Math.sin(t) * O.ry * q,
          on: true,
          t: 0,
        });
      }
    }
    this.cars.forEach((c, i) => (c.index = i));
    this.player = player;
    const botDef = C.bot.get(venue.bots.bot)!;
    for (let i = 0; i < venue.bots.count; i++) {
      const b = makeBot(this, botDef, i);
      spawnBot(this, b, true);
      this.bots.push(b);
    }
  }

  /** The sample index of grid slot k (two abreast, rows behind the line). */
  gridSlot(k: number): number {
    const T = this.track!;
    return (T.n - 6 - Math.floor(k / 2) * 8 + T.n) % T.n;
  }

  placeOnTrack(c: Car, i: number, side: number): void {
    const T = this.track!;
    const a = T.a[i]!;
    c.x = T.x[i]! - Math.sin(a) * side * this.road * 0.22;
    c.y = T.y[i]! + Math.cos(a) * side * this.road * 0.22;
    c.h = a;
    c.idx = i;
  }

  get kind(): 'race' | 'derby' {
    return this.mode.kind;
  }

  get time(): number {
    return this.tick * DT;
  }

  get laps(): number {
    return this.lapsOpt ?? this.mode.laps ?? 0;
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  /** Events since the last call. */
  takeEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Is (x, y) off the road? Always false in an arena. */
  offroad(x: number, y: number): boolean {
    return this.grid !== null && this.grid.at(x, y) > this.road / 2 + 3;
  }

  /** Clamp a point of radius r inside the world (the rectangle, or the derby oval). */
  keepInside(x: number, y: number, r: number): [number, number] {
    const O = this.oval;
    if (!O) return [clamp(x, 10 + r, this.w - 10 - r), clamp(y, 10 + r, this.h - 10 - r)];
    const ex = (x - O.cx) / O.rx;
    const ey = (y - O.cy) / O.ry;
    const q = Math.hypot(ex, ey);
    const lim = 1 - r / ((O.rx + O.ry) / 2);
    if (q <= lim) return [x, y];
    return [O.cx + ((x - O.cx) * lim) / q, O.cy + ((y - O.cy) * lim) / q];
  }

  private readonly cells = new Map<number, StaticProp[]>();
  private celled = 0;

  /**
   * The static props that could be within r of (x, y): those in the grid cells round it, in a
   * fixed order. A town has thousands of pieces, and nothing should look at all of them.
   */
  near(x: number, y: number, r: number): StaticProp[] {
    const S = this.statics;
    if (S.length < this.celled) {
      this.cells.clear();
      this.celled = 0;
    }
    for (; this.celled < S.length; this.celled++) {
      const s = S[this.celled]!;
      const k = Math.floor(s.x / 64) * 4096 + Math.floor(s.y / 64);
      const c = this.cells.get(k);
      if (c) c.push(s);
      else this.cells.set(k, [s]);
    }
    // 12: the widest static's radius
    const x0 = Math.floor((x - r - 12) / 64);
    const x1 = Math.floor((x + r + 12) / 64);
    const y0 = Math.floor((y - r - 12) / 64);
    const y1 = Math.floor((y + r + 12) / 64);
    const out: StaticProp[] = [];
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const c = this.cells.get(cx * 4096 + cy);
        if (c) for (const s of c) out.push(s);
      }
    return out;
  }

  /** Is there no static prop within d of (x, y)? */
  free(x: number, y: number, d: number): boolean {
    for (const s of this.near(x, y, d)) {
      const r = s.def.radius;
      if (
        !s.down &&
        Math.abs(s.x - x) < d + r &&
        Math.abs(s.y - y) < d + r &&
        Math.hypot(s.x - x, s.y - y) < d + r
      )
        return false;
    }
    return true;
  }

  standings(): Car[] {
    return standings(this);
  }

  /** Advance one tick. `player` is ignored when the player's car is on autopilot. */
  step(player: Controls = NO_CONTROLS): void {
    this.tick++;
    if (this.phase === 'countdown') {
      this.countdown -= DT;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastBeep && n >= 1 && n <= 3) {
        this.lastBeep = n;
        this.emit({ t: 'countdown', n });
      }
      if (this.countdown <= 0) {
        this.phase = 'race';
        this.emit({ t: 'go' });
      }
    } else if (this.phase === 'race') this.raceTime += DT;
    const live = this.phase === 'race';

    for (const c of this.cars) {
      c.invuln = Math.max(0, c.invuln - DT);
      c.fireCd -= DT;
      c.hitCd -= DT;
      c.scrapeCd -= DT;
      let ctl: Controls = NO_CONTROLS;
      if (c.wrecked) {
        c.wreckT += DT;
        if (
          !this.knockout &&
          this.mode.respawnSeconds !== undefined &&
          c.wreckT > this.mode.respawnSeconds
        )
          respawn(this, c);
      } else if (live) {
        ctl = c.ai ? c.ai.behaviour.drive(this, c) : c.isPlayer ? player : NO_CONTROLS;
        if (c.finished && c.isPlayer && !c.ai) ctl = { ...NO_CONTROLS, brake: true };
      } else if (c.isPlayer) c.throttle = player.throttle;
      if (live || c.wrecked) drive(this, c, ctl);
      else {
        c.roll *= 0.9;
        c.bounce = c.isPlayer && c.throttle > 0 ? this.rng.range(0, 0.4) : 0;
      }
      if (ctl.fire) fire(this, c);
      if (live && !c.wrecked && (c.ai || c.isPlayer)) shoot(this, c);
    }
    for (let i = 0; i < this.cars.length; i++)
      for (let j = i + 1; j < this.cars.length; j++)
        collideCars(this, this.cars[i]!, this.cars[j]!);
    for (const c of this.cars) {
      collideWorld(this, c);
      collideProps(this, c);
      if (this.track) trackIndex(this, c);
    }
    for (const b of this.bots) updateBot(this, b);
    updateProps(this);
    updatePickups(this);
    updateRockets(this);
    updateMines(this);
    updateArms(this);
    updateEmbers(this);

    if (this.sandbox) return;
    if (this.knockout && this.kind === 'race' && live && this.endT < 0) {
      // the race is over for a wrecked player, and won when no rival is left running
      const P = this.player;
      if (P.wrecked) this.endT = 2.6;
      else if (this.cars.length > 1 && this.cars.every((c) => c === P || c.wrecked)) {
        if (!P.finished) {
          P.finished = true;
          P.finishTime = this.raceTime;
          this.finishers.push(P.index);
          this.emit({ t: 'finish', car: P.index, place: this.finishers.length });
        }
        this.endT = 2.8;
      }
    }
    if (this.kind === 'derby' && live) {
      this.timeLeft -= DT;
      const alive = this.cars.filter((c) => !c.wrecked).length;
      if (this.endT < 0 && (alive <= 1 || this.player.wrecked || this.timeLeft <= 0))
        this.endT = this.player.wrecked ? 2.6 : 2;
    }
    if (this.endT > 0) {
      this.endT -= DT;
      if (this.endT <= 0) {
        this.phase = 'over';
        this.emit({ t: 'over' });
      }
    }
  }

  /** A hash of everything that matters, for determinism tests. */
  hash(): string {
    const H = new Hasher().num(this.tick);
    for (const v of this.rng.state()) H.word(v);
    for (const c of this.cars)
      H.num(c.x)
        .num(c.y)
        .num(c.h)
        .num(c.vx)
        .num(c.vy)
        .num(c.hp)
        .num(c.lap)
        .num(c.score)
        .num(c.wrecked ? 1 : 0);
    for (const b of this.bots)
      H.num(b.x)
        .num(b.y)
        .num(b.alive ? 1 : 0);
    for (const p of this.props)
      H.num(p.x)
        .num(p.y)
        .num(p.alive ? 1 : 0);
    H.num(this.rockets.length).num(this.mines.length);
    H.num(this.embers.length)
      .num(this.blazes.length)
      .num(this.spills.length)
      .num(this.craters.length);
    const A = this.arms;
    H.num(A.gobs.length).num(A.stickies.length).num(A.shells.length).num(A.orbs.length);
    for (const b of A.balls) H.num(b.x).num(b.y);
    let down = 0;
    for (const s of this.statics) if (s.down) down++;
    H.num(down);
    return H.hex();
  }

  /** Seconds the player has been pointing the wrong way. */
  wrongWay(): boolean {
    const P = this.player;
    return this.track !== null && P.wrongT > 1 && !P.wrecked;
  }
}

/** Is the angle from car c to (x, y) within `cone` of its heading? */
export function ahead(c: Car, x: number, y: number, cone: number): boolean {
  return Math.abs(angDiff(Math.atan2(y - c.y, x - c.x), c.h)) < cone;
}
