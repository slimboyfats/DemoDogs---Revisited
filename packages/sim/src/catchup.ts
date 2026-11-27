import { DT, GRAVITY, type PickupManifest, type SimEvent } from '@demodogs/shared';
import { damage } from './damage';
import { absorb } from './defence';
import type { Car } from './entities';
import { clamp } from './math';
import { launchHunter } from './hunt';
import { standings } from './race';
import type { World } from './world';

/**
 * Catch-up: what keeps a race close. A pickup's odds lean on where the car that takes it is
 * running (the back of the field rolls the strong ones), a human far behind is helped along a
 * little, and five items do the rest. All of them work on the car the moment they are picked up,
 * the same for a human and for a rival:
 *
 * - grow: the car swells. It is heavier, rams harder, shrugs off blows, breaks scenery it would
 *   have bounced off, and flattens any car much smaller than it is.
 * - shrink: every other car in the race is zapped small: slow, light, and flat under the first car
 *   of its own old size that catches it. The nearer the front a car is, the longer it stays small.
 * - hunt: a rocket that flies up the road over the whole pack and lands on the car in front
 *   (hunt.ts).
 * - wind: a burst of top speed, longer the further back the car is.
 * - collar: a lead weight on the car in front.
 * - bones: heavy loose props fall out of the sky onto the road in front of every rival ahead.
 *
 * Grow and shrink are in the derby too; there, and for anybody with nobody ahead of them, an item
 * that looks for "rivals ahead" takes the rivals within its `radius` instead.
 *
 * A car that has just been towed back, or put back on the road, finds its feet for a few seconds
 * (`fresh`): it blinks, nothing can hurt it, and it is slow at first.
 */

/** How fast a car changes size, in sizes per second. */
const SWELL = 3.2;
/** A car this many times the size of another drives over it instead of bumping it. */
const SQUASH_RATIO = 1.5;
/** Seconds a flattened car lies flat with its engine dead, and the blow it takes (before the mode's scale). */
const SQUASH_TIME = 1.4;
const SQUASH_DAMAGE = 34;
/** The least closing speed that flattens: a nudge at walking pace just shoves. */
const SQUASH_SPEED = 25;
/** Bones: the height the first one falls from, and how much higher each one after it starts. */
const DROP_FROM = 150;
const DROP_STEP = 28;
/** No more bones fall while this many of the kind are lying about. */
const MAX_LITTER = 24;
/** A car this much road behind the one in front rolls the back marker's odds, wherever it is placed. */
const ADRIFT = 1500;

const secs = (d: PickupManifest, fallback: number) => d.seconds ?? fallback;
const NAME = (d: PickupManifest) => d.meta.name.toUpperCase();

/** How far back car c is running: 0 in front, 1 at the back, 0.5 where there is no order. */
export function place(w: World, c: Car): number {
  if (w.kind !== 'race' || !w.track || w.sandbox) return 0.5;
  let ahead = 0;
  let n = 0;
  let front = c.progress;
  for (const o of w.cars) {
    if (o.finished) continue;
    n++;
    if (o !== c && (o.progress > c.progress || (o.progress === c.progress && o.index < c.index)))
      ahead++;
    if (!o.wrecked) front = Math.max(front, o.progress);
  }
  // by its place, or by how far off the front it is, whichever makes it the further back: a car
  // third of eight but half a lap adrift needs the help as much as the one at the back
  return n < 2 ? 0.5 : Math.max(ahead / (n - 1), clamp((front - c.progress) / ADRIFT, 0, 1));
}

/**
 * The chance of pickup `k` for car c: its weight, leaned by where c is running, and by how much
 * the mode `favours` crates of its kind (a mode's `crates`).
 */
export function odds(
  k: PickupManifest,
  hurt: boolean,
  at: number,
  favours?: Readonly<Record<string, number>>,
): number {
  const lead = k.lead ?? 1;
  const trail = k.trail ?? 1;
  const lean = favours?.[k.kind] ?? 1;
  return (hurt ? k.hurtWeight : k.weight) * (lead + (trail - lead) * at) * lean;
}

/** The rivals an item of c's goes for: all those ahead in a race, else those within `radius`. */
export function rivals(w: World, c: Car, radius: number): Car[] {
  const ok = (o: Car) => o !== c && !o.wrecked && !o.finished;
  if (w.kind === 'race' && w.track) {
    const ahead = w.cars.filter((o) => ok(o) && o.progress > c.progress);
    if (ahead.length) return ahead;
  }
  return w.cars.filter((o) => ok(o) && Math.hypot(o.x - c.x, o.y - c.y) < radius);
}

/** The car to weigh down: whoever is in front, or the next one along if that is c. */
function frontRunner(w: World, c: Car): Car | null {
  return standings(w).find((o) => o !== c && !o.wrecked && !o.finished) ?? null;
}

function say(
  w: World,
  what: Extract<SimEvent, { t: 'catchup' }>['what'],
  c: Car,
  by: number,
  def: PickupManifest,
): void {
  w.emit({ t: 'catchup', what, car: c.index, by, id: def.id, x: c.x, y: c.y });
}

/** A catch-up pickup taken: set it to work and return the words to float, or null if `got` is not one. */
export function fitCatchup(w: World, c: Car, got: PickupManifest): string | null {
  switch (got.kind) {
    case 'grow': {
      c.morph = { def: got, t: secs(got, 8) };
      say(w, 'grow', c, c.index, got);
      return `${NAME(got)} ${Math.round(secs(got, 8))}s`;
    }
    case 'shrink': {
      let n = 0;
      const all = got.all === true && w.kind === 'race' && !!w.track && !w.sandbox;
      const full = secs(got, 7);
      const tail = got.tail ?? 1;
      for (const o of all
        ? w.cars.filter((o) => o !== c && !o.wrecked && !o.finished)
        : rivals(w, c, got.radius ?? 300))
        // (the car in front is held the whole time, the one at the back the least of it)
        if (zap(w, c, o, got, all ? full * (1 - (1 - tail) * place(w, o)) : full)) n++;
      return n ? `${NAME(got)} x${n}` : `${NAME(got)}: NOBODY IN REACH`;
    }
    case 'hunt': {
      const o = launchHunter(w, c, got);
      return o ? `${NAME(got)}: AFTER ${o.name}` : `${NAME(got)}: NOBODY IN REACH`;
    }
    case 'wind': {
      // the further back, the longer it blows
      const t = secs(got, 4) * (0.7 + 0.6 * place(w, c));
      c.wind = { def: got, t: Math.max(c.wind?.t ?? 0, t) };
      say(w, 'wind', c, c.index, got);
      return `${NAME(got)} ${t.toFixed(1)}s`;
    }
    case 'collar': {
      const o = frontRunner(w, c);
      if (!o || o.invuln > 0) return `${NAME(got)}: NOBODY IN REACH`;
      const fresh = !o.collar;
      o.collar = { def: got, t: secs(got, 6), by: c.index };
      if (fresh) say(w, 'collar', o, c.index, got);
      return `${NAME(got)} ON ${o.name}`;
    }
    case 'bones': {
      const def = got.prop ? w.content.prop.get(got.prop) : undefined;
      if (!def) return null;
      let lying = 0;
      for (const p of w.props) if (p.alive && p.def === def) lying++;
      let n = 0;
      for (const o of rivals(w, c, got.radius ?? 300)) {
        if (lying >= MAX_LITTER) break;
        say(w, 'bones', o, c.index, got);
        for (let i = 0; i < (got.charges ?? 3); i++, lying++, n++) {
          const z = DROP_FROM + i * DROP_STEP;
          // where the car will be when this one lands, give or take
          const t = Math.sqrt((2 * z) / (GRAVITY * 0.95));
          const a = w.rng.range(0, Math.PI * 2);
          const d = w.rng.range(0, 9);
          const [x, y] = w.keepInside(
            o.x + o.vx * t * 0.9 + Math.cos(a) * d,
            o.y + o.vy * t * 0.9 + Math.sin(a) * d,
            def.radius,
          );
          w.props.push({
            index: w.props.length,
            def,
            x,
            y,
            z: z + o.deck,
            vx: 0,
            vy: 0,
            vz: -1,
            rot: w.rng.range(0, Math.PI * 2),
            spin: w.rng.range(-7, 7),
            alive: true,
            fuse: 0,
            owner: c.index,
          });
        }
      }
      return n ? `${NAME(got)} x${n}` : `${NAME(got)}: NOBODY IN REACH`;
    }
    default:
      return null;
  }
}

/** Car `by` zaps car o with shrink pickup `def`. A shield takes it; a swollen car is only brought back down. */
function zap(w: World, by: Car, o: Car, def: PickupManifest, time: number): boolean {
  if (o.invuln > 0) return false;
  w.emit({ t: 'arc', x: o.x + 14, y: o.y - 10, z: o.z + 150, tx: o.x, ty: o.y, tz: o.z + 4 });
  if (o.shield > 0) {
    absorb(w, o, 25, o.x, o.y);
    return false;
  }
  if (o.morph?.def.kind === 'grow') {
    o.morph = null;
    say(w, 'back', o, by.index, def);
    return true;
  }
  o.morph = { def, t: time };
  say(w, 'shrink', o, by.index, def);
  return true;
}

/**
 * Two cars touching, one much bigger than the other: the small one is flattened where it stands
 * and the big one drives on over it. True if this pair is not to be collided the ordinary way.
 */
export function flatten(w: World, a: Car, b: Car): boolean {
  const [big, small] = a.size >= b.size ? [a, b] : [b, a];
  if (big.size < small.size * SQUASH_RATIO || big.wrecked || small.wrecked) return false;
  if (small.squashT > 0) return true;
  if (small.invuln > 0 || Math.hypot(big.vx - small.vx, big.vy - small.vy) < SQUASH_SPEED)
    return false;
  small.squashT = SQUASH_TIME;
  small.stall = Math.max(small.stall ?? 0, SQUASH_TIME * 0.8);
  small.vx *= 0.2;
  small.vy *= 0.2;
  small.spin = 0;
  big.vx *= 0.96;
  big.vy *= 0.96;
  w.emit({
    t: 'catchup',
    what: 'squash',
    car: small.index,
    by: big.index,
    id: (small.morph ?? big.morph)?.def.id ?? '',
    x: small.x,
    y: small.y,
  });
  damage(w, small, SQUASH_DAMAGE * big.ram, big, small.x, small.y);
  return true;
}

/** How much a human this far behind is helped along (see `ModeManifest.chase`). */
function chase(w: World, c: Car, front: number): number {
  const C = w.mode.chase;
  if (!C || !c.isPlayer || c.finished) return 1;
  return 1 + (C.pace - 1) * clamp((front - c.progress - C.gap) / (C.full - C.gap), 0, 1);
}

/** Once a tick, before the cars drive: items run down, cars change size, and each car's pace is set. */
export function updateCatchup(w: World): void {
  let front = -Infinity;
  if (w.kind === 'race' && w.track && w.mode.chase && w.phase === 'race')
    for (const c of w.cars) if (!c.finished) front = Math.max(front, c.progress);
  for (const c of w.cars) {
    if (c.wrecked) {
      // the tow truck brings back a plain car
      if (c.collar) dropCollar(w, c);
      c.morph = c.wind = null;
      c.size = c.pace = 1;
      c.squashT = 0;
      continue;
    }
    if (c.morph && (c.morph.t -= DT) <= 0) {
      say(w, 'back', c, -1, c.morph.def);
      c.morph = null;
    }
    const to = c.morph?.def.scale ?? 1;
    c.size += clamp(to - c.size, -SWELL * DT, SWELL * DT);
    c.squashT = Math.max(0, c.squashT - DT);
    if (c.wind && (c.wind.t -= DT) <= 0) c.wind = null;
    if (c.collar && (c.collar.t -= DT) <= 0) dropCollar(w, c);
    c.pace =
      (c.morph?.def.pace ?? 1) *
      (c.wind?.def.pace ?? 1) *
      (c.collar?.def.pace ?? 1) *
      (front > -Infinity ? chase(w, c, front) : 1);
    if (c.fresh > 0) {
      // finding its feet: slow at first, all of its speed back by the end
      const { freshSeconds, freshPace } = w.tuning;
      c.pace *= 1 - (1 - freshPace) * clamp(c.fresh / Math.max(freshSeconds, 0.01), 0, 1);
      c.fresh = Math.max(0, c.fresh - DT);
    }
  }
}

/**
 * A car is back on the road after a tow or a rescue: for `tuning.freshSeconds` it cannot be hurt
 * and is slow, so it neither loses the place again at once nor gains by the trip.
 */
export function freshen(w: World, c: Car, least = 0): void {
  const t = w.tuning.freshSeconds;
  c.fresh = t;
  c.invuln = Math.max(c.invuln, t, least);
}

function dropCollar(w: World, c: Car): void {
  const K = c.collar!;
  c.collar = null;
  say(w, 'collar-off', c, K.by, K.def);
}
