import { World, stand, type WorldOptions } from '@demodogs/sim';
import { loadContent } from './index';

/** A world on the shipped content, for tests. */
export function makeWorld(opts: Partial<Omit<WorldOptions, 'content'>> = {}): World {
  return new World({
    content: loadContent(),
    venue: 'venue.kennel-loop',
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

/** A field with only the player, no bots, no loose props and no mud: a clean bench for physics tests. */
export function bench(opts: Partial<Omit<WorldOptions, 'content'>> = {}): World {
  const w = startRace(makeWorld({ rivals: 0, ...opts }));
  w.bots.length = 0;
  w.props.length = 0;
  w.spills.length = 0;
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

/** An open spot in the middle of a venue with nothing static nearby. */
export function openSpot(w: World, clear = 60): [number, number] {
  for (let y = 60; y < w.h - 60; y += 20)
    for (let x = 60; x < w.w - 60; x += 20)
      if (w.free(x, y, clear) && !w.offroad(x, y)) return [x, y];
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
  const w = bench({ venue: 'venue.the-pit', rivals: 1, ...opts });
  w.statics.length = 0;
  const r = w.cars.find((c) => !c.isPlayer)!;
  r.ai = null;
  put(r, w.oval!.cx + 250, w.oval!.cy + 250, 0);
  return w;
}
