import {
  BASE_SPEED,
  DT,
  NO_CONTROLS,
  type Controls,
  type SimEvent,
  type Difficulty,
  type Tuning,
} from '@demodogs/shared';
import { World, type Car, type Content, type Entrant, type Setup } from '@demodogs/sim';
import { STILL, heard, type Air } from '../audio/ambience';
import { engineNote, type EngineNote } from '../audio/engine';
import type { Sound } from '../audio/sound';
import { tuneFor, type Tune } from '../audio/tunes';
import type { Input } from '../input/input';
import type { Art, ArtJob } from '../render/art';
import { buildArt } from '../render/art-pool';
import type { NetRace } from '../net/lockstep';
import { Effects } from '../render/effects';
import { makeGround, type Ground } from '../render/ground';
import { PITCH, type Camera } from '../render/scene';
import { terrainOf } from '../render/terrain';
import { cuesOf, hitStop, Shaker, STOP_REST, type Feel } from './feel';

/** How far off another car's engine can be heard, in art pixels. */
const EARSHOT = 240;
/** How far off a thing's own noise (a crowd, birds in a tree) is heard, art px. */
const HEARD = 230;
/** How far off the loudest things (a lighthouse's horn) are heard. */
const FAR = 520;

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
  /** Cash counts here (the career): crates hold it. Anywhere else there is none to pick up. */
  purse?: boolean;
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
  /** How hard the rivals are (the RIVALS button; an online race is always normal). */
  difficulty?: Difficulty;
  /** Rule numbers from the DEV SETTINGS pane (never for an online race). */
  tuning?: Partial<Tuning>;
  /** How it feels: shake, hit-stop and buzz, as set on this device. */
  feel?: Feel;
}

/** What is being got ready, step `done` of `of`; resolves once it has been shown. */
export type Report = (text: string, done: number, of: number) => Promise<void>;

/**
 * What the renderer does of a race while it loads, so that none of it is left for the first
 * frames: `early` as soon as the ground is made, `ready` last, with the whole session (it says
 * what it is doing, `steps` times, through `say`).
 */
export interface Stage {
  early?(world: World, ground: Ground): void;
  steps: number;
  ready(s: Session, say: (text: string) => Promise<void>): Promise<void>;
}

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
    ...(o.purse ? {} : { cashless: true }),
    ...(o.playOn ? { playOn: true } : {}),
    ...(o.sandbox ? { sandbox: true } : {}),
    ...(o.laps ? { laps: o.laps } : {}),
    ...(o.humans ? { humans: o.humans } : {}),
    ...(o.you !== undefined ? { you: o.you } : {}),
    ...(o.name ? { name: o.name } : {}),
    ...(o.paint ? { paint: o.paint } : {}),
    ...(o.modifiers?.length ? { modifiers: o.modifiers } : {}),
    ...(o.tuning && !o.humans ? { tuning: o.tuning } : {}),
    ...(o.difficulty && o.you === undefined ? { difficulty: o.difficulty } : {}),
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
    this.ground = made?.ground ?? makeGround(this.world);
    this.fx = new Effects(this.world, o.art, this.ground, o.sound);
    const P = this.world.player;
    this.cam = { x: P.x, y: P.y, ox: 0, oy: 0 };
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
  static async load(o: SessionOptions, report: Report, stage?: Stage): Promise<Session> {
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
    // the art is built on other threads (where the browser has them) while the ground is made here
    const jobs: ArtJob[] = [];
    const label = new Map<ArtJob, string>();
    const job = (j: ArtJob, text: string) => {
      jobs.push(j);
      label.set(j, text);
    };
    for (const c of cars.values())
      job({ kind: 'car', id: c.id, paint: c.paint }, `Building ${c.name.toUpperCase()}`);
    for (const id of props)
      job(
        { kind: 'prop', id },
        `Scenery: ${(o.content.prop.get(id)?.meta.name ?? id).toLowerCase()}`,
      );
    for (const b of bots.values())
      job({ kind: 'bot', id: b.id, paint: b.paint }, 'Waking the scrap bots');
    const of = 2 + jobs.length + (stage?.steps ?? 0);
    let done = 1;
    let grounded = false;
    const building = buildArt(
      o.art,
      jobs,
      (j) => {
        done++;
        // (while the ground is being made the loader says so; then, whatever was built last)
        if (grounded) void report(label.get(j)!, done, of);
      },
      (j) => report(label.get(j)!, done, of),
    );
    await report('Painting the ground', done, of);
    const ground = makeGround(world);
    stage?.early?.(world, ground);
    grounded = true;
    done++;
    await building;
    const s = new Session(o, { world, ground });
    if (stage) await stage.ready(s, (text) => report(text, done++, of));
    await report('Starting engines', done, of);
    return s;
  }

  /** How much of the world the screen shows, in art pixels across and down the ground. */
  setView(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h / Math.sin(PITCH);
  }

  /**
   * This screen's driver has chosen to drive the ghost of a scrapped car (sim/haunt.ts). Off, a
   * wreck's driver sends nothing, so no ghost gets up while they watch the others.
   */
  ghost = false;

  /** What this screen's driver is doing with the controls this tick. */
  private controls(): Controls {
    const ctl = this.o.input.read(this.world.player.h);
    return this.world.player.wrecked && !this.ghost ? NO_CONTROLS : ctl;
  }

  /** One fixed tick: read input, step the world, play its events, move the camera. */
  step(): void {
    this.tickWith(() => this.world.step(this.controls()));
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
    const events = w.takeEvents();
    const before = this.fx.shake;
    this.fx.handle(events);
    this.blow(before, P.vx - this.pvx, P.vy - this.pvy, events);
    this.pvx = P.vx;
    this.pvy = P.vy;
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
    if (!this.advancing) this.sway(DT);
  }

  /** The player's car's speed a tick ago, to tell which way a blow threw it. */
  private pvx = 0;
  private pvy = 0;
  private readonly shaker = new Shaker();
  /** Real seconds the world is still held for (hit-stop), and game seconds until it may be again. */
  private hold = 0;
  private rest = 0;
  private advancing = false;

  /**
   * A tick's blows: where the effects asked for more shake than was already going, the picture
   * is kicked (the way the car was thrown, if it was), the phone buzzes, and a big one stops the
   * clock for a moment. Offline only for the stop: an online race keeps every screen's time.
   */
  private blow(before: number, dvx: number, dvy: number, events: readonly SimEvent[]): void {
    const feel = this.o.feel;
    this.rest -= DT;
    const amount = this.fx.shake;
    if (amount > before + 0.75) {
      const thrown = Math.hypot(dvx, dvy) > 12;
      this.shaker.kick(amount, thrown ? dvx : 0, thrown ? dvy : 0);
      feel?.thump(amount);
      const stop = hitStop(amount) * (feel?.setup.stop ?? 1);
      if (stop > 0 && this.rest <= 0 && !this.net) {
        this.hold = stop;
        this.rest = STOP_REST;
      }
    }
    if (feel) for (const c of cuesOf(events, this.world.player.index)) feel.cue(c);
  }

  /** Swing the picture on by `dt` real seconds. */
  private sway(dt: number): void {
    this.shaker.step(dt, this.fx.shake, this.o.feel?.setup.shake ?? 1);
    this.cam.ox = this.shaker.x;
    this.cam.oy = this.shaker.y;
  }

  /** Kick the picture as a blow of `amount` would (the SCREEN SHAKE slider shows itself so). */
  nudge(amount: number): void {
    this.shaker.kick(amount);
  }

  /** While paused: only the picture's swing runs on. */
  idle(dt: number): void {
    this.sway(dt);
  }

  /** Since they were last taken: ticks run, ms in the world alone, ms taking them into effects. */
  ticks = 0;
  simMs = 0;
  stepMs = 0;

  /** Advance by dt seconds of real time. Returns true once the race is over (the first time). */
  advance(dt: number): boolean {
    this.advancing = true;
    try {
      this.sway(dt);
      if (this.net) {
        this.net.local(this.controls());
        this.net.pump(dt, {
          step: (seats) => this.stepSeats(seats),
          hash: () => this.world.hash(),
        });
        return this.over();
      }
      // a big blow holds the world still for a few frames; the picture goes on shaking
      if (this.hold > 0) {
        this.hold -= dt;
        return this.over();
      }
      this.acc += dt * this.rate;
      let n = 0;
      while (this.acc >= DT && n < MAX_STEPS && this.hold <= 0) {
        this.step();
        this.acc -= DT;
        n++;
      }
      if (n === MAX_STEPS) this.acc = 0;
      return this.over();
    } finally {
      this.advancing = false;
    }
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
      note: this.noteOf(C),
      frac: top(C),
      throttle: C.wrecked && !C.haunt?.up ? 0 : Math.abs(C.throttle),
      boost: C.boosting,
      slide:
        C.sliding && moving > 40 ? Math.min(1, 0.35 + side / 110 + (C.handbrake ? 0.2 : 0)) : 0,
      loose: C.offroad || this.looseRoad,
      rival: near
        ? {
            note: this.noteOf(near),
            frac: top(near),
            throttle: Math.abs(near.throttle),
            near: (1 - best / EARSHOT) ** 1.5,
          }
        : null,
    });
    // (its own count: `ticks` is taken and zeroed by whoever reads the frame's cost)
    if (this.heardT++ % 12 === 0) this.air = this.listen(C);
    this.o.sound.ambience(this.air, DT);
  }

  /** The sky over the car is a dark one (the screen says so): the birds are asleep. */
  night = false;
  private readonly notes = new Map<string, EngineNote>();
  private air: Air = STILL;
  private heardT = 0;

  /** A car's engine: its manifest's say, and its stats for whatever that leaves out. */
  private noteOf(c: Car): EngineNote {
    let n = this.notes.get(c.def.id);
    if (!n) this.notes.set(c.def.id, (n = engineNote(c.def.stats, c.def.engine)));
    return n;
  }

  /**
   * What the place sounds like from car `C`: the wind, anything burning, and the nearest of each
   * kind of thing that makes a noise standing there. Birds keep quiet in the dark and the rain.
   */
  private listen(C: Car): Air {
    const w = this.world;
    const air: Air = { ...STILL };
    const sky = this.fx.weather;
    air.wind = Math.min(1, Math.hypot(w.wind[0], w.wind[1]) / 80);
    for (const b of w.blazes)
      air.fire = Math.max(air.fire, heard(Math.hypot(b.x - C.x, b.y - C.y) - b.r, 150));
    for (const s of w.near(C.x, C.y, FAR)) {
      if (s.down) continue;
      const what = s.def.ambient ?? (s.def.crown && s.leaves ? 'birds' : null);
      if (!what) continue;
      // a ride that has been hurt stands still, and its organ with it
      if ((what === 'fair' || what === 'creak') && this.fx.scarred.has(s)) continue;
      // a lighthouse's horn carries; a lantern is a small flame
      const reach = what === 'horn' ? FAR : HEARD;
      const v =
        heard(Math.hypot(s.x - C.x, s.y - C.y) - s.def.radius, reach) * (what === 'fire' ? 0.4 : 1);
      if (v > air[what]) air[what] = v;
    }
    if (this.night || sky.dark > 0.5 || sky.rain > 0.1) air.birds = 0;
    // a flag hangs and a mill stands in still air: both go with the wind, and never quite stop
    air.flap *= 0.35 + 0.65 * air.wind;
    air.creak *= 0.5 + 0.5 * air.wind;
    return air;
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
