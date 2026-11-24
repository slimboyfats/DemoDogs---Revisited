import { updateAddons } from './addons';
import { updateDefence } from './defence';
import {
  DT,
  FIELD_SIZE,
  ADDON_KINDS,
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
import { updateMovers } from './movers';
import { updatePads } from './pads';
import { updateRide } from './mounds';
import { updateCritters, type Critter } from './critters';
import { collideCars, collideProps, collideWorld, drive, makeCar } from './physics';
import { explode, fall, respawn, updateEmbers, updateMending } from './damage';
import { updateSagging } from './spans';
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
import { blinded, updateDrops, type Cloud, type Spike } from './drops';
import { updateCatchup } from './catchup';
import { stallControls, updatePulses, type Pulse } from './shock';
import { updateHowls, type Howl } from './howl';
import { newArsenal, updateArsenal, type Arsenal } from './arsenal';
import { newWild, type Wild } from './wild';
import { newArms, updateArms, type Arms } from './arms';
import { FLAT_RELIEF, buildRelief, type Relief } from './relief';
import { updateRivers } from './river';
import { updatePresses } from './hazards';
import { updateGuards, type Decoy } from './guards';
import { addModifier, updateModifiers, type Mod } from './modifiers';

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
  /**
   * Online play: the other human drivers, seats 1, 2, ... (the player is seat 0). Each peer builds
   * the same world from the same options; only `you` differs.
   */
  humans?: Entrant[];
  /** The player's name and paint, instead of YOU and the car's own (online seat 0). */
  name?: string;
  paint?: string;
  /**
   * Which seat `player` points at (default 0): the car this screen follows. It is a viewpoint
   * only: no rule reads `player`, so every peer simulates the same race whatever its `you`.
   */
  you?: number;
  /** A wrecked car is out for good, and the race ends when the player is. */
  knockout?: boolean;
  /**
   * A derby runs on to its last car (or the clock) after every human is scrapped, so they can
   * watch the end. Off, it ends a moment after the last human is out.
   */
  playOn?: boolean;
  /** Laps, instead of the mode's. */
  laps?: number;
  /**
   * A test range: no countdown and no end, and the rivals are parked targets that nobody drives.
   * See range.ts for what can be done to them.
   */
  sandbox?: boolean;
  /**
   * World modifiers on for this race (content ids): weather, night, low gravity and the like.
   * Online, every peer gets the same list.
   */
  modifiers?: string[];
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
  /** The lie of the land, or null where the venue is flat. */
  readonly relief: Relief | null = null;
  /**
   * A flyover's deck along the track: the height of the road surface at each sample (0 on the
   * ground), and the static piece of deck that carries it there (-1: none). Null without one.
   */
  /**
   * The road's own surface at each track sample where it is not plain road (a stretch of dirt,
   * ice, sand): null without any.
   */
  readonly roadSurface: (MaterialManifest | null)[] | null = null;
  deckH: Float32Array | null = null;
  deckPiece: Int32Array | null = null;
  /** Where the deck has no rails (1): a car can leave its edge there. */
  deckOpen: Uint8Array | null = null;
  readonly road: number;
  readonly knockout: boolean;
  readonly playOn: boolean;
  readonly sandbox: boolean;
  /** The gun every car carries: the pack's gun, if it has one. */
  readonly gun: WeaponManifest | null;
  private readonly lapsOpt: number | undefined;
  readonly cars: Car[] = [];
  readonly bots: Bot[] = [];
  readonly statics: StaticProp[] = [];
  /** The statics that are track tiles (boost tiles, ramps): see pads.ts. */
  readonly pads: StaticProp[] = [];
  /** The statics that are shapes in the road (speed bumps, dips, potholes): see mounds.ts. */
  readonly mounds: StaticProp[] = [];
  /** Animals: see critters.ts. */
  readonly critters: Critter[] = [];
  readonly props: LooseProp[] = [];
  readonly rockets: Rocket[] = [];
  readonly mines: Mine[] = [];
  /** Shock pulses still spreading. */
  readonly pulses: Pulse[] = [];
  /** Howls: shockwaves still running out. */
  readonly howls: Howl[] = [];
  /** Decoys thrown out for rockets to chase, and the id the next one gets. */
  readonly decoys: Decoy[] = [];
  decoySeq = 0;
  readonly pickups: Pickup[] = [];
  /** Burning bits in the air, and pools of fire on the ground. */
  readonly embers: Ember[] = [];
  readonly blazes: Blaze[] = [];
  /** Fallen scenery waiting to be built again. */
  readonly mending: StaticProp[] = [];
  /** Bridge deck that has lost its footing and is about to come down (see spans.ts). */
  readonly sagging: StaticProp[] = [];
  /** Pits blasts have dug in the ground. */
  readonly craters: Crater[] = [];
  /** Pools of oil, fuel, water and the like on the ground. */
  readonly spills: Spill[] = [];
  /** Smoke clouds and spikes dropped behind cars. */
  readonly clouds: Cloud[] = [];
  readonly spikes: Spike[] = [];
  /** Sprays, rail slugs, wrecking balls, fire shells and sticky bombs in play. */
  readonly arms: Arms = newArms();
  /** Sticks, skipping bombs, hooks, shells, diggers, turrets, fleas, rays, bolts and fire trails. */
  readonly arsenal: Arsenal = newArsenal();
  /** Twisters, flails, bones on their way down and cracks running through the ground. */
  readonly wild: Wild = newWild();
  /** World modifiers at work (see modifiers.ts), and the numbers they set for the other rules. */
  readonly mods: Mod[] = [];
  /** The share of their grip cars keep (rain). */
  grip = 1;
  /** Gravity, as a share of the usual. */
  gravity = 1;
  /** How fast a rival that cannot see drives (night, lamps smashed). */
  blindPace = 1;
  /** The wind, art px per second squared; (0, 0) in still air. */
  readonly wind: [number, number] = [0, 0];
  /** What a wrecked car leaks: the pack's material that says so, if any. */
  readonly leak: MaterialManifest | null;
  /**
   * The car this screen follows (seat `you`). Rules never read it: in online play it differs
   * between peers. Rules use `humans`.
   */
  readonly player: Car;
  /** Human-driven cars by seat: the player first, then any online drivers. */
  readonly humans: Car[] = [];
  /** Car indices in finishing order. */
  readonly finishers: number[] = [];
  phase: Phase = 'countdown';
  tick = 0;
  countdown = COUNTDOWN;
  raceTime = 0;
  timeLeft = 0;
  /** Seconds until the result screen, once the end is decided; -1 before. */
  endT = -1;
  /** Online race: once one human has finished, the race ends at this race time; 0 before. */
  finishBy = 0;
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
    this.playOn = opts.playOn ?? false;
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
      const N = this.track.n;
      for (const s of venue.track.surfaces ?? []) {
        const m = C.material.get(s.material);
        if (!m) continue;
        const road = (this.roadSurface ??= new Array<MaterialManifest | null>(N).fill(null));
        const i0 = Math.min(N - 1, Math.floor(s.from * N));
        const len = ((Math.min(N - 1, Math.floor(s.to * N)) - i0 + N) % N) + 1;
        for (let k = 0; k < len; k++) road[(i0 + k) % N] = m;
      }
    }
    if (venue.oval) this.oval = { ...venue.oval };
    const raised = venue.track?.raised ?? [];
    if ((venue.relief && (venue.relief.hills > 0 || venue.relief.banks > 0)) || raised.length)
      this.relief = buildRelief(
        venue.relief ?? FLAT_RELIEF,
        venue.seed,
        this.w,
        this.h,
        this.track,
        this.road,
        this.oval,
        raised,
      );
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
      opts.paint ?? carDef.paint,
      opts.name ?? 'YOU',
      true,
      opts.autopilot ? aiDef : null,
      opts.player,
    );
    player.seat = 0;
    this.humans.push(player);
    for (const e of opts.humans ?? []) {
      const def = C.car.get(e.car);
      if (!def) throw new Error(`no car ${e.car}`);
      const h = makeCar(this, def, e.paint, e.name, true, null, e);
      h.seat = this.humans.length;
      this.humans.push(h);
    }
    const others = this.humans.slice(1);
    const rivals: Car[] = [];
    for (const e of opts.field ?? []) {
      const def = C.car.get(e.car);
      if (!def) throw new Error(`no car ${e.car}`);
      rivals.push(makeCar(this, def, e.paint, e.name, false, this.sandbox ? null : aiDef, e));
    }
    const count = opts.field ? 0 : (opts.rivals ?? Math.max(0, FIELD_SIZE - this.humans.length));
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
      const order = [...rivals.slice(0, 3), player, ...others, ...rivals.slice(3)];
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
            z: this.deckAt(i),
            on: true,
            t: 0,
          });
      }
    } else if (this.oval) {
      const O = this.oval;
      const all = [player, ...others, ...rivals];
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
          z: 0,
          on: true,
          t: 0,
        });
      }
    }
    this.cars.forEach((c, i) => (c.index = i));
    this.player = this.humans[opts.you ?? 0] ?? player;
    const botDef = C.bot.get(venue.bots.bot)!;
    for (let i = 0; i < venue.bots.count; i++) {
      const b = makeBot(this, botDef, i);
      spawnBot(this, b, true);
      this.bots.push(b);
    }
    // in a fixed order, whatever order they were picked in
    for (const id of [...new Set(opts.modifiers ?? [])].sort()) {
      const def = C.modifier.get(id);
      if (!def) throw new Error(`no modifier ${id}`);
      addModifier(this, def);
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

  /** The deck's height at track sample i: 0 off the deck, or where its piece has come down. */
  deckAt(i: number): number {
    const H = this.deckH;
    if (!H) return 0;
    const h = H[i]!;
    if (h <= 0) return 0;
    const k = this.deckPiece![i]!;
    return k >= 0 && this.statics[k]!.down ? 0 : h;
  }

  /**
   * The height of what holds car c up: the deck if it is on it (within the road's width of its
   * place on the track and not already down underneath it), else the ground.
   */
  support(c: Car): number {
    if (!this.deckH || !this.track) return 0;
    const i = c.idx;
    const h = this.deckAt(i);
    if (h <= 0 || c.z < h - 5) return 0;
    const T = this.track;
    const a = T.a[i]!;
    const off = -(c.x - T.x[i]!) * Math.sin(a) + (c.y - T.y[i]!) * Math.cos(a);
    return Math.abs(off) > this.road / 2 + 2 ? 0 : h;
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

  /** The furthest any human has got round the track (rivals rubber-band to it). */
  humanProgress(): number {
    let best = -Infinity;
    for (const c of this.humans) best = Math.max(best, c.progress);
    return best;
  }

  standings(): Car[] {
    return standings(this);
  }

  /** Advance one tick. `player` drives the car this screen follows (ignored on autopilot). */
  step(player: Controls = NO_CONTROLS): void {
    if (this.humans.length === 1) this.stepSeats([player]);
    else {
      const all = this.humans.map(() => NO_CONTROLS);
      all[this.player.seat] = player;
      this.stepSeats(all);
    }
  }

  /** Advance one tick with each human seat's controls (online play: seat order, not `you`). */
  stepSeats(seats: readonly Controls[]): void {
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

    updateCatchup(this);
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
        ctl = c.ai
          ? c.ai.behaviour.drive(this, c)
          : c.isPlayer
            ? (seats[c.seat] ?? NO_CONTROLS)
            : NO_CONTROLS;
        if (c.finished && c.isPlayer && !c.ai) ctl = { ...NO_CONTROLS, brake: true };
        ctl = blinded(this, c, ctl);
        ctl = stallControls(c, ctl);
      } else if (c.isPlayer) c.throttle = (seats[c.seat] ?? NO_CONTROLS).throttle;
      if (live || c.wrecked) drive(this, c, ctl);
      else {
        c.roll *= 0.9;
        c.bounce = c.isPlayer && c.throttle > 0 ? this.rng.range(0, 0.4) : 0;
      }
      updateMovers(this, c);
      updatePads(this, c);
      updateRide(this, c);
      if (ctl.fire) fire(this, c);
      if (live && !c.wrecked && (c.ai || c.isPlayer)) shoot(this, c);
    }
    for (let i = 0; i < this.cars.length; i++)
      for (let j = i + 1; j < this.cars.length; j++) {
        const c = this.cars[i]!;
        const o = this.cars[j]!;
        // a car down a pit is not there to be hit
        if (c.buried || o.buried || (c.sunk ?? 0) > 0 || (o.sunk ?? 0) > 0) continue;
        collideCars(this, c, o);
      }
    for (const c of this.cars) {
      collideWorld(this, c);
      collideProps(this, c);
      if (this.track) trackIndex(this, c);
    }
    for (const b of this.bots) updateBot(this, b);
    if (this.critters.length) updateCritters(this);
    updateProps(this);
    updatePresses(this);
    updatePickups(this);
    updateDefence(this);
    updateGuards(this, (x, y, power, z) => explode(this, x, y, power, null, z));
    updateAddons(this);
    updateRockets(this);
    updateMines(this);
    updateDrops(this);
    updatePulses(this);
    updateHowls(this);
    updateArms(this);
    updateArsenal(this);
    if (this.mods.length) updateModifiers(this, live);
    updateEmbers(this);
    updateRivers(this);
    if (this.sagging.length) updateSagging(this, (w, s) => fall(w, s, s.x, s.y));
    if (this.mending.length) updateMending(this);

    if (this.sandbox) return;
    if (this.knockout && this.kind === 'race' && live && this.endT < 0) {
      // the race is over once every human is wrecked, and won when no rival is left running
      const H = this.humans;
      const running = H.filter((c) => !c.wrecked);
      if (running.length === 0) this.endT = 2.6;
      else if (this.cars.length > 1 && this.cars.every((c) => c.isPlayer || c.wrecked)) {
        if (running.length === 1) {
          const P = running[0]!;
          if (!P.finished) {
            P.finished = true;
            P.finishTime = this.raceTime;
            this.finishers.push(P.index);
            this.emit({ t: 'finish', car: P.index, place: this.finishers.length });
          }
          this.endT = 2.8;
        }
      }
    }
    if (this.kind === 'derby' && live) {
      this.timeLeft -= DT;
      const alive = this.cars.filter((c) => !c.wrecked).length;
      const out = !this.playOn && this.humans.every((c) => c.wrecked);
      if (this.endT < 0 && (alive <= 1 || out || this.timeLeft <= 0)) this.endT = out ? 2.6 : 2;
    }
    if (this.endT < 0 && this.finishBy > 0 && this.raceTime >= this.finishBy) this.endT = 0.5;
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
        .num(c.size)
        .num(c.nitro)
        .num(c.cash)
        .num(fitHash(c))
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
      .num(this.craters.length)
      .num(this.clouds.length)
      .num(this.spikes.length)
      .num(this.decoys.length);
    const A = this.arms;
    H.num(A.gobs.length).num(A.stickies.length).num(A.shells.length).num(A.orbs.length);
    for (const b of A.balls) H.num(b.x).num(b.y);
    const K = this.arsenal;
    H.num(K.sticks.length).num(K.toys.length).num(K.hooks.length).num(K.tethers.length);
    H.num(K.strikes.length).num(K.moles.length).num(K.sentries.length).num(K.fleas.length);
    H.num(K.beams.length).num(K.bolts.length).num(K.trails.length);
    for (const k of this.critters) H.num(k.x).num(k.y).num(k.z);
    const W = this.wild;
    H.num(W.flails.length).num(W.bones.length).num(W.cracks.length);
    for (const t of W.twisters) H.num(t.x).num(t.y);
    for (const h of W.holes) H.num(h.x).num(h.y).num(h.t);
    let down = 0;
    for (const s of this.statics) if (s.down) down++;
    H.num(down);
    if (this.mods.length) {
      H.num(this.wind[0]).num(this.wind[1]).num(this.gravity).num(this.grip);
      for (const m of this.mods) H.num(m.next).num(m.pending.length).num(m.laid).num(m.shakeT);
    }
    return H.hex();
  }

  /** Seconds the player has been pointing the wrong way. */
  wrongWay(): boolean {
    const P = this.player;
    return this.track !== null && P.wrongT > 1 && !P.wrecked;
  }
}

/** A car's add-ons as one number: which are on, and what each has left. */
function fitHash(c: Car): number {
  let h = 0;
  ADDON_KINDS.forEach((k, i) => {
    const f = c.fit[k];
    if (f) h += (i + 1) * 7919 + f.n * 31 + f.t;
  });
  return h;
}

/** Is the angle from car c to (x, y) within `cone` of its heading? */
export function ahead(c: Car, x: number, y: number, cone: number): boolean {
  return Math.abs(angDiff(Math.atan2(y - c.y, x - c.x), c.h)) < cone;
}
