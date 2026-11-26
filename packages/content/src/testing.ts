import { NO_CONTROLS, VenueSchema, type Controls, type SimEvent } from '@demodogs/shared';
import {
  World,
  putProp,
  stand,
  type Content,
  type Critter,
  type WorldOptions,
} from '@demodogs/sim';
import benchPit from './fixtures/bench-pit.json';
import benchVenue from './fixtures/bench.json';
import { loadContent } from './index';

/**
 * The venues tests stand on, which are not in the game: a race track (`venue.bench`) and a derby
 * bowl (`venue.bench-pit`) that never change, so the game's own tracks can be rebuilt without a
 * test that leans on where a bend or a tree is having to be put right.
 */
export const BENCH = 'venue.bench';
export const BENCH_PIT = 'venue.bench-pit';

let withBench: Content | null = null;

/** The shipped content, with the tests' two venues beside the game's own. */
export function testContent(): Content {
  if (withBench) return withBench;
  const C = loadContent();
  const venue = new Map(C.venue);
  for (const v of [benchVenue, benchPit]) venue.set(v.id, VenueSchema.parse(v));
  return (withBench = { ...C, venue });
}

/** A world on the shipped content, for tests: on the bench track unless a venue is named. */
export function makeWorld(opts: Partial<Omit<WorldOptions, 'content'>> = {}): World {
  return new World({
    content: testContent(),
    venue: BENCH,
    car: 'car.mutt',
    seed: 1,
    ...opts,
  });
}

/** Step until `done` or `maxTicks`; returns the ticks run. */
export function runUntil(w: World, done: (w: World) => boolean, maxTicks: number): number {
  let n = 0;
  while (n < maxTicks && !done(w)) {
    w.step();
    n++;
  }
  return n;
}

/** Skip the countdown. */
export function startRace(w: World): World {
  runUntil(w, (w) => w.phase !== 'countdown', 600);
  return w;
}

/** What lines the bench venue's road (its `trackside` and `gantry` rules). */
const TRACKSIDE = new Set(['prop.barrier', 'prop.armco', 'prop.gantry-leg', 'prop.gantry-beam']);

/** A field with only the player, no bots, no loose props, no animals, no tiles and no mud: a clean bench for physics tests. */
export function bench(opts: Partial<Omit<WorldOptions, 'content'>> = {}): World {
  const w = startRace(makeWorld({ rivals: 0, ...opts }));
  w.bots.length = 0;
  w.props.length = 0;
  w.spills.length = 0;
  w.critters.length = 0;
  w.pads.length = 0;
  w.paths.length = 0;
  // and no walls beside the road or gantry over it: the bench is open ground
  for (const s of w.statics) if (TRACKSIDE.has(s.def.id)) s.down = true;
  return w;
}

/** Put a car at (x, y) heading h with speed v along the heading. */
export function put(
  c: { x: number; y: number; h: number; vx: number; vy: number; z: number; vz: number },
  x: number,
  y: number,
  h: number,
  v = 0,
): void {
  c.x = x;
  c.y = y;
  c.h = h;
  c.vx = Math.cos(h) * v;
  c.vy = Math.sin(h) * v;
  c.z = 0;
  c.vz = 0;
}

/** Does anything solid stand within d of (x, y)? (Flowers and long grass do not count.) */
function solidNear(w: World, x: number, y: number, d: number): boolean {
  return w
    .near(x, y, d)
    .some((s) => !s.down && s.def.solid && Math.hypot(s.x - x, s.y - y) < d + s.def.radius);
}

/** An open spot in the middle of a venue with nothing solid nearby. */
export function openSpot(w: World, clear = 60): [number, number] {
  for (let y = 60; y < w.h - 60; y += 20)
    for (let x = 60; x < w.w - 60; x += 20)
      if (!w.offroad(x, y) && !solidNear(w, x, y, clear)) return [x, y];
  throw new Error('no open spot');
}

/**
 * Drive the player into a lone prop at `speed` across open ground and report what happened.
 * `clearance`: how far apart the car starts.
 */
export function propTest(id: string, speed: number, clearance = 30) {
  const w = bench();
  const def = loadContent().prop.get(id)!;
  const [x, y] = openSpot(w, 100);
  const c = w.player;
  put(c, x - clearance - def.radius, y, 0, speed);
  const events: string[] = [];
  let blocked = false;
  let maxZ = 0;
  const loose = def.body === 'loose';
  if (loose)
    w.props.push({
      index: 0,
      def,
      x,
      y,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rot: 0,
      spin: 0,
      alive: true,
      fuse: 0,
      owner: -1,
    });
  const piece = loose ? null : stand(w, def, x, y, 0, 0);
  for (let i = 0; i < 90; i++) {
    w.step({ steer: 0, throttle: 0, brake: false, boost: false, fire: false });
    for (const e of w.takeEvents()) events.push(e.t);
    if (c.vx < 0) blocked = true;
    if (loose) maxZ = Math.max(maxZ, w.props[0]!.z);
  }
  const prop = loose ? w.props[0]! : { alive: true, x, z: 0 };
  return { world: w, prop, piece, events, blocked, maxZ, start: x };
}

/** The derby bowl emptied of everything: open flat ground with no road to leave. */
export function flatBench(opts: Partial<Omit<WorldOptions, 'content'>> = {}): World {
  // one parked rival out of the way, or the derby would be won on the spot
  const w = bench({ venue: BENCH_PIT, rivals: 1, ...opts });
  w.statics.length = 0;
  const r = w.cars.find((c) => !c.isPlayer)!;
  r.ai = null;
  put(r, w.oval!.cx + 250, w.oval!.cy + 250, 0);
  return w;
}

/**
 * The flat bench with `n` rivals nobody drives beside the one parked out of the way, the player
 * holding weapon `id` fully loaded, and the middle of the ground. A place to try a weapon.
 */
export function armed(id: string, n = 1, seed = 1) {
  const w = flatBench({ rivals: n + 1, seed });
  const me = w.player;
  const far = w.cars.find((c) => !c.isPlayer)!;
  const rivals = w.cars.filter((c) => c !== me && c !== far);
  for (const c of rivals) c.ai = null;
  const def = loadContent().weapon.get(id)!;
  me.weapon = def;
  me.ammo = def.ammo;
  /** Step `n` ticks (pressing `ctl`) and gather the events by type. */
  const run = (ticks: number, ctl: Controls = NO_CONTROLS): SimEvent[] => {
    const out: SimEvent[] = [];
    for (let i = 0; i < ticks; i++) {
      w.step(ctl);
      out.push(...w.takeEvents());
    }
    return out;
  };
  return { w, me, rivals, def, x: w.oval!.cx, y: w.oval!.cy, run };
}

/**
 * Drive the player along +x over tile `id` (null: over bare ground, to compare) lying across its
 * way and pointing `rot`, starting at `speed` with the throttle at `throttle`, for two seconds.
 */
export function padTest(id: string | null, speed: number, rot = 0, throttle = 1) {
  const w = flatBench();
  const c = w.player;
  const x = w.oval!.cx - 80;
  const y = w.oval!.cy;
  if (id) stand(w, loadContent().prop.get(id)!, x, y, rot, 0);
  put(c, x - 40, y, 0, speed);
  const events: string[] = [];
  let maxZ = 0;
  let top = 0;
  for (let i = 0; i < 120; i++) {
    w.step({ steer: 0, throttle, brake: false, boost: false, fire: false });
    for (const e of w.takeEvents()) events.push(e.t);
    maxZ = Math.max(maxZ, c.z);
    top = Math.max(top, c.vx);
  }
  return { world: w, car: c, events, maxZ, top };
}

/**
 * Drive the player along +x over road shape `id` (null: over bare ground, to compare) lying
 * across its way `side` art px to its right, starting at `speed` with the throttle at `throttle`,
 * for two seconds. Reports how high it flew and how far it tipped.
 */
export function moundTest(id: string | null, speed: number, throttle = 1, side = 0) {
  const w = flatBench();
  const c = w.player;
  const x = w.oval!.cx - 80;
  const y = w.oval!.cy;
  if (id) stand(w, loadContent().prop.get(id)!, x, y + side, 0, 0);
  put(c, x - 40, y, 0, speed);
  const events: string[] = [];
  let maxZ = 0;
  let maxPitch = 0;
  let minPitch = 0;
  for (let i = 0; i < 120; i++) {
    w.step({ steer: 0, throttle, brake: false, boost: false, fire: false });
    for (const e of w.takeEvents()) events.push(e.t);
    maxZ = Math.max(maxZ, c.z);
    maxPitch = Math.max(maxPitch, c.pitch);
    minPitch = Math.min(minPitch, c.pitch);
  }
  return { world: w, car: c, events, maxZ, maxPitch, minPitch };
}

/**
 * Put a group of animals `id` down on open flat ground and drive the player past them at
 * `speed`, `miss` art px to one side (0: straight through the middle). `packed` stands them all
 * on the car's line, and `gap` is how far off the car starts. Reports what the car did to them over `ticks`.
 */
export function critterTest(
  id: string,
  speed: number,
  miss = 0,
  packed = false,
  ticks = 150,
  gap = 150,
  throttle = 1,
  seed = 1,
) {
  const w = flatBench({ seed });
  const c = w.player;
  const x = w.oval!.cx;
  const y = w.oval!.cy;
  putProp(w, loadContent().prop.get(id)!, x, y, 0, w.rng);
  const critters: Critter[] = w.critters;
  if (packed)
    critters.forEach((k, i) => {
      k.x = x + i * 2;
      k.y = y + ((i % 3) - 1) * 3;
      k.t = 99;
    });
  const from = critters.map((k) => [k.x, k.y] as const);
  put(c, x - gap, y + miss, 0, speed);
  const events: string[] = [];
  let maxZ = 0;
  let blocked = false;
  let slowest = speed;
  let flung = 0;
  let bumped = 0;
  for (let i = 0; i < ticks; i++) {
    w.step({ steer: 0, throttle: i < 120 ? throttle : 0, brake: false, boost: false, fire: false });
    for (const e of w.takeEvents()) {
      if (e.t !== 'critter') continue;
      events.push(e.what);
      if (e.what === 'flung') flung++;
      if (e.what === 'bump') bumped++;
    }
    for (const k of critters) maxZ = Math.max(maxZ, k.z);
    if (c.vx < 0) blocked = true;
    if (i < 110) slowest = Math.min(slowest, c.vx);
  }
  const fled = critters.filter(
    (k, i) => Math.hypot(k.x - from[i]![0], k.y - from[i]![1]) > 12,
  ).length;
  return { world: w, car: c, critters, events, maxZ, blocked, slowest, flung, bumped, fled };
}
