import { BASE_SPEED, DT, type Controls, type Tuning } from '@demodogs/shared';
import { World, type Car, type Content, type Entrant, type Setup } from '@demodogs/sim';
import type { Sound } from '../audio/sound';
import { tuneFor, type Tune } from '../audio/tunes';
import type { Input } from '../input/input';
import type { Art } from '../render/art';
import type { NetRace } from '../net/lockstep';
import { Effects } from '../render/effects';
import { coloursOf, makeGround, type Ground } from '../render/ground';
import { PITCH, PITCH_PLAIN, PITCH_TOY, setPitch, type Camera } from '../render/scene';
import { sunReach } from '../render/cast';
import { terrainOf } from '../render/terrain';

/** How far off another car's engine can be heard, in art pixels. */
const EARSHOT = 240;

export interface SessionOptions {
  content: Content;
  art: Art;
  sound: Sound;
  input: Input;
  venue: string;
  car: string;
  seed: number;
  autopilot: boolean;
  /** A career race: the named rivals, the player's car as it stands, and no tow truck. */
  field?: Entrant[];
  player?: Setup;
  knockout?: boolean;
  /** A derby plays on after this screen's car is scrapped, to be watched (or skipped). */
  playOn?: boolean;
  /** A test range: parked targets, no countdown, no end. */
  sandbox?: boolean;
  /** Laps, instead of the mode's (a custom track sets its own). */
  laps?: number;
  /** Online: the other drivers (seats 1, 2, ...) and which seat this screen drives. */
  humans?: Entrant[];
  you?: number;
  /** Online: seat 0's name and paint. */
  name?: string;
  paint?: string;
  /** World modifiers on for this race (content ids). */
  modifiers?: string[];
  /** Rule numbers from the DEV SETTINGS pane (never for an online race). */
  tuning?: Partial<Tuning>;
}

/** What is being got ready, step `done` of `of`; resolves once it has been shown. */
export type Report = (text: string, done: number, of: number) => Promise<void>;

function makeWorld(o: SessionOptions): World {
  return new World({
    content: o.content,
    venue: o.venue,
    car: o.car,
    seed: o.seed,
    autopilot: o.autopilot,
    ...(o.field ? { field: o.field } : {}),
    ...(o.player ? { player: o.player } : {}),
    ...(o.knockout ? { knockout: true } : {}),
    ...(o.playOn ? { playOn: true } : {}),
    ...(o.sandbox ? { sandbox: true } : {}),
    ...(o.laps ? { laps: o.laps } : {}),
    ...(o.humans ? { humans: o.humans } : {}),
    ...(o.you !== undefined ? { you: o.you } : {}),
    ...(o.name ? { name: o.name } : {}),
    ...(o.paint ? { paint: o.paint } : {}),
    ...(o.modifiers?.length ? { modifiers: o.modifiers } : {}),
    ...(o.tuning && !o.humans ? { tuning: o.tuning } : {}),
  });
}

/** At most this many sim ticks per frame, so a slow frame does not snowball. */
const MAX_STEPS = 5;

/**
 * One race or derby: the sim world, the client's effects and ground, and the camera. The world
 * steps at a fixed 60 Hz however fast the screen refreshes.
 */
export class Session {
  readonly world: World;
  readonly fx: Effects;
  readonly ground: Ground;
  readonly cam: Camera;
  private acc = 0;
  private viewW = 360;
  private viewH = 260;
  private overSeen = false;

  /** Game seconds per real second (the test range slows time down or stops it). */
  rate = 1;
  /** The camera follows the player's car; off, it stays where it is put. */
  follow = true;
  /**
   * Spectating: the car the camera follows instead of this screen's own, or a spot it rests on.
   * A viewpoint only, like `world.player`: nothing in the world reads it.
   */
  watch: Car | null = null;
  spot: { x: number; y: number } | null = null;
  /** Online: the race driver decides when ticks run and with whose controls. */
  net: NetRace | null = null;
  /** The tune this venue is raced to. */
  readonly tune: Tune;
  /** The venue's road is a loose one: tyres wash over it instead of squealing. */
  private readonly looseRoad: boolean;

  constructor(
    private readonly o: SessionOptions,
    made?: { world: World; ground: Ground },
  ) {
    this.world = made?.world ?? makeWorld(o);
    // a toy venue is seen from lower down, so things stand up, under a low sun that throws long
    // shadows; whoever made the session sets the view next, which takes the pitch up
    const toy = coloursOf(this.world.venue.colors).style === 'toy';
    setPitch(toy ? PITCH_TOY : PITCH_PLAIN);
    sunReach.k = toy ? 1.7 : 1;
    this.ground = made?.ground ?? makeGround(this.world);
    this.fx = new Effects(this.world, o.art, this.ground, o.sound);
    const P = this.world.player;
    this.cam = { x: P.x, y: P.y, shake: 0 };
    const v = this.world.venue;
    this.looseRoad = v.colors.road === 'dirt';
    this.tune = tuneFor({
      derby: o.content.mode.get(v.mode)?.kind === 'derby',
      terrain: terrainOf(v.colors),
      dirtRoad: this.looseRoad,
    });
  }

  /**
   * Get a session ready a piece at a time, saying what is being built as it goes: the world, the
   * ground, each car in the field (the slow part: a car is hundreds of thousands of pixels), the
   * scenery and the bots.
   */
  static async load(o: SessionOptions, report: Report): Promise<Session> {
    const venue = o.content.venue.get(o.venue)?.meta.name.toUpperCase() ?? '';
    await report(`Laying out ${venue}`, 0, 1);
    const world = makeWorld(o);
    const cars = new Map<string, { id: string; paint: string; name: string }>();
    for (const c of world.cars)
      cars.set(c.def.id + c.paint, { id: c.def.id, paint: c.paint, name: c.def.meta.name });
    const props = new Set<string>();
    for (const s of world.statics) {
      props.add(s.def.id);
      // what it leaves when it comes down, so a rockfall is not built in the middle of a race
      if (s.def.rubble) props.add(s.def.rubble.prop);
    }
    for (const p of world.props) props.add(p.def.id);
    // the animals, in every step of their walk
    for (const k of world.critters) props.add(k.def.id);
    // and what the weather may leave standing
    for (const m of world.mods) if (m.def.leaves) props.add(m.def.leaves.prop);
    const bots = new Map<string, { id: string; paint: string }>();
    for (const b of world.bots) bots.set(b.def.id + b.paint, { id: b.def.id, paint: b.paint });
    const of = 3 + cars.size + props.size;
    let done = 1;
    await report('Painting the ground', done++, of);
    const ground = makeGround(world);
    for (const c of cars.values()) {
      await report(`Building ${c.name.toUpperCase()}`, done++, of);
      o.art.car(c.id, c.paint);
    }
    for (const id of props) {
      const name = o.content.prop.get(id)?.meta.name ?? id;
      await report(`Scenery: ${name.toLowerCase()}`, done++, of);
      o.art.warm(id);
    }
    await report('Waking the scrap bots', done++, of);
    for (const b of bots.values()) o.art.bot(b.id, b.paint);
    await report('Starting engines', done, of);
    return new Session(o, { world, ground });
  }

  /** How much of the world the screen shows, in art pixels across and down the ground. */
  setView(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h / Math.sin(PITCH);
  }

  /** One fixed tick: read input, step the world, play its events, move the camera. */
  step(): void {
    this.tickWith(() => this.world.step(this.o.input.read(this.world.player.h)));
  }

  /** One online tick with every seat's controls. */
  stepSeats(seats: Controls[]): void {
    this.tickWith(() => this.world.stepSeats(seats));
  }

  private tickWith(run: () => void): void {
    const w = this.world;
    const P = w.player;
    const t0 = performance.now();
    run();
    const t1 = performance.now();
    this.fx.handle(w.takeEvents());
    this.fx.afterStep();
    this.simMs += t1 - t0;
    this.stepMs += performance.now() - t1;
    this.ticks++;
    // the engine heard is the car on screen
    const C = this.watch ?? P;
    this.o.sound.step(DT);
    if (!P.ai || this.watch || this.o.sound.taping) this.hear(C);
    // the camera looks ahead of the car, the way it is going
    // never so far that the car leaves the middle third of the picture
    const lead = 0.42;
    const mx = this.viewW * 0.3;
    const my = this.viewH * 0.3;
    const tx = this.spot?.x ?? C.x + Math.max(-mx, Math.min(mx, C.vx * lead));
    const ty = this.spot?.y ?? C.y + Math.max(-my, Math.min(my, C.vy * lead));
    if (this.follow) {
      const k = Math.min(1, 4 * DT);
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
    }
    this.cam.shake = this.fx.shake;
  }

  /** Since they were last taken: ticks run, ms in the world alone, ms taking them into effects. */
  ticks = 0;
  simMs = 0;
  stepMs = 0;

  /** Advance by dt seconds of real time. Returns true once the race is over (the first time). */
  advance(dt: number): boolean {
    if (this.net) {
      this.net.local(this.o.input.read(this.world.player.h));
      this.net.pump(dt, { step: (seats) => this.stepSeats(seats), hash: () => this.world.hash() });
      return this.over();
    }
    this.acc += dt * this.rate;
    let n = 0;
    while (this.acc >= DT && n < MAX_STEPS) {
      this.step();
      this.acc -= DT;
      n++;
    }
    if (n === MAX_STEPS) this.acc = 0;
    return this.over();
  }

  /** The engine and tyres of the car on screen, and the engine of the car nearest it. */
  private hear(C: Car): void {
    const top = (c: Car) => Math.abs(c.vf) / (BASE_SPEED * c.stats.speed);
    const side = Math.abs(C.vy * Math.cos(C.h) - C.vx * Math.sin(C.h));
    const moving = Math.hypot(C.vx, C.vy);
    let near: Car | null = null;
    let best = EARSHOT;
    for (const o of this.world.cars) {
      if (o === C || o.wrecked) continue;
      const d = Math.hypot(o.x - C.x, o.y - C.y);
      if (d < best) {
        best = d;
        near = o;
      }
    }
    this.o.sound.drive({
      frac: top(C),
      throttle: C.wrecked ? 0 : Math.abs(C.throttle),
      boost: C.boosting,
      slide:
        C.sliding && moving > 40 ? Math.min(1, 0.35 + side / 110 + (C.handbrake ? 0.2 : 0)) : 0,
      loose: C.offroad || this.looseRoad,
      rival: near
        ? { frac: top(near), throttle: Math.abs(near.throttle), near: (1 - best / EARSHOT) ** 1.5 }
        : null,
    });
  }

  private over(): boolean {
    if (this.world.phase === 'over' && !this.overSeen) {
      this.overSeen = true;
      return true;
    }
    return false;
  }

  resetClock(): void {
    this.acc = 0;
  }
}
