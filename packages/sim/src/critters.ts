import {
  DT,
  FLUNG_BELOW,
  GRAVITY,
  type CritterManifest,
  type PropManifest,
} from '@demodogs/shared';
import { damage } from './damage';
import type { Car, StaticProp } from './entities';
import { TAU, angDiff, clamp } from './math';
import { carShape, newShape, newTouch, pointGap, reach } from './shapes';

/** A car's hull and where an animal meets it: filled again for each pair. */
const HULL = newShape();
const AT = newTouch();
import type { Rng } from './prng';
import type { World } from './world';

/**
 * Animals: chickens, sheep, cows, crows and the like that live beside a track. Each is put down
 * as a prop with a `critter` (see shared/pieces.ts), which becomes a group of them in
 * `world.critters`. They wander near home, bolt from fast cars, and are knocked flying (light
 * ones) or stand their ground (heavy ones). Birds take off and come down again. Some heavy ones
 * attack: they pick out a car, paw the ground and run at it (`charge`). None of them is ever
 * killed: what lands gets up and runs.
 */
export interface Critter {
  index: number;
  def: PropManifest;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Heading, radians. */
  h: number;
  /** Home: where its group was put down. */
  hx: number;
  hy: number;
  /** Where it is walking, or where a bird will come down. */
  tx: number;
  ty: number;
  /**
   * idle: standing about. walk: strolling to (tx, ty). flee: running from a car. air: knocked
   * flying. fly: a bird on the wing. wind: turned on a car, pawing the ground. charge: running
   * at it.
   */
  state: 'idle' | 'walk' | 'flee' | 'air' | 'fly' | 'wind' | 'charge';
  /** Seconds left of standing, of fright, of flight, of pawing or of the charge. */
  t: number;
  /** The car it has picked out (an index into world.cars), or -1. */
  prey: number;
  /** Seconds until it has its breath back and can charge again. */
  blown: number;
  /** How far it has gone on foot, art px: its gait. */
  gait: number;
}

/** How far off a car still wakes an animal up, art px. Further than this it just stands. */
const AWAKE = 320;

/** Put a group of `def` animals down round (x, y). */
export function spawnCritters(
  w: World,
  def: PropManifest,
  x: number,
  y: number,
  rot: number,
  rng: Rng,
): void {
  const D = def.critter!;
  const n = D.group[0] + rng.int(D.group[1] - D.group[0] + 1);
  for (let i = 0; i < n; i++) {
    const a = rng.next() * TAU;
    const d =
      n === 1 ? 0 : Math.sqrt(rng.next()) * Math.min(D.roam, 6 + def.radius * 2.2 * Math.sqrt(n));
    const [px, py] = w.keepInside(x + Math.cos(a) * d, y + Math.sin(a) * d, def.radius + 2);
    w.critters.push({
      index: w.critters.length,
      def,
      x: px,
      y: py,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      h: n === 1 ? rot : rng.next() * TAU,
      hx: x,
      hy: y,
      tx: px,
      ty: py,
      state: 'idle',
      t: rng.range(0.3, 3),
      prey: -1,
      blown: 0,
      gait: 0,
    });
  }
}

/** A spot within its roaming ground. */
function spot(w: World, k: Critter, D: CritterManifest): [number, number] {
  const a = w.rng.next() * TAU;
  const d = Math.sqrt(w.rng.next()) * D.roam;
  return w.keepInside(k.hx + Math.cos(a) * d, k.hy + Math.sin(a) * d, k.def.radius + 2);
}

/** Knock an animal into the air with this velocity. */
function fling(w: World, k: Critter, vx: number, vy: number, vz: number, by: number): void {
  k.state = 'air';
  k.vx = vx;
  k.vy = vy;
  k.vz = vz;
  k.z = Math.max(k.z, 1);
  w.emit({ t: 'critter', what: 'flung', critter: k.index, car: by, x: k.x, y: k.y, power: vz });
}

/** A bird leaves the ground, away from (fx, fy). */
function takeOff(w: World, k: Critter, D: CritterManifest, fx: number, fy: number): void {
  k.state = 'fly';
  k.t = w.rng.range(3.5, 6.5);
  [k.tx, k.ty] = spot(w, k, D);
  k.h = fx || fy ? Math.atan2(fy, fx) + w.rng.range(-0.5, 0.5) : k.h;
  k.z = Math.max(k.z, 1);
  w.emit({ t: 'critter', what: 'up', critter: k.index, car: -1, x: k.x, y: k.y, power: 0 });
}

/** A blast at (x, y) reaching `rad`: animals in it are thrown, birds near it take off. */
export function blastCritters(w: World, x: number, y: number, rad: number): void {
  for (const k of w.critters) {
    const dx = k.x - x;
    const dy = k.y - y;
    if (Math.abs(dx) > rad * 2 || Math.abs(dy) > rad * 2) continue;
    const d = Math.hypot(dx, dy);
    const D = k.def.critter!;
    if (D.kind === 'bird') {
      if (k.state !== 'fly' && k.state !== 'air') takeOff(w, k, D, dx, dy);
      continue;
    }
    if (d > rad || k.state === 'air') continue;
    const p = (1 - d / rad) / Math.max(0.35, Math.sqrt(D.mass * 4));
    fling(w, k, (dx / (d || 1)) * 190 * p, (dy / (d || 1)) * 190 * p, 90 + 170 * p, -1);
  }
}

/** The list `near` fills for an animal on a walk. */
const WALK_NEAR: StaticProp[] = [];

export function updateCritters(w: World): void {
  for (const k of w.critters) {
    const D = k.def.critter!;
    if (k.state === 'air') {
      // knocked flying: it comes down where it comes down, and gets up running
      k.vz -= GRAVITY * DT;
      k.z += k.vz * DT;
      [k.x, k.y] = w.keepInside(k.x + k.vx * DT, k.y + k.vy * DT, k.def.radius);
      if (k.z <= 0) {
        k.z = 0;
        k.vz = 0;
        k.h = Math.atan2(k.vy, k.vx);
        k.state = 'flee';
        k.t = 2.2;
      }
      continue;
    }
    // what is there to be afraid of
    let fx = 0;
    let fy = 0;
    let scared = false;
    let awake = false;
    for (const c of w.cars) {
      const dx = k.x - c.x;
      const dy = k.y - c.y;
      if (Math.abs(dx) > AWAKE || Math.abs(dy) > AWAKE) continue;
      awake = true;
      const d = Math.hypot(dx, dy);
      if (d < D.scare && Math.hypot(c.vx, c.vy) > D.shy) {
        scared = true;
        fx += dx / (d + 1);
        fy += dy / (d + 1);
      }
    }
    if (D.kind === 'bird' && k.state === 'fly') {
      fly(w, k, D);
      continue;
    }
    if (D.charge) {
      // nothing frightens it; it does the frightening
      scared = false;
      if (k.blown > 0) k.blown -= DT;
      if (awake && attack(w, k, D, D.charge)) {
        for (const c of w.cars) meet(w, k, D, c);
        continue;
      }
    }
    // with nobody near, it stands where it is: a field of sheep costs nothing far from the race
    if (!awake && k.state !== 'flee') continue;
    if (scared) {
      if (D.kind === 'bird') {
        takeOff(w, k, D, fx, fy);
        continue;
      }
      k.state = 'flee';
      k.t = 1.2;
    }
    let want = k.h;
    let speed = 0;
    let turn = 5;
    if (k.state === 'flee') {
      if (scared) want = Math.atan2(fy, fx);
      else if ((k.t -= DT) <= 0) {
        k.state = 'idle';
        k.t = w.rng.range(0.6, 2);
      }
      speed = D.run;
      turn = 9;
    } else if (k.state === 'idle') {
      if ((k.t -= DT) <= 0) {
        [k.tx, k.ty] = spot(w, k, D);
        k.state = 'walk';
      }
    } else if (k.state === 'walk') {
      const dx = k.tx - k.x;
      const dy = k.ty - k.y;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
        k.state = 'idle';
        k.t = w.rng.range(1, 4.5);
      } else {
        want = Math.atan2(dy, dx);
        speed = D.walk;
      }
    }
    if (k.state === 'charge') {
      const C = D.charge!;
      const c = w.cars[k.prey];
      // it runs nearly straight: a car that swerves late gets out of its way
      if (c) want = aim(k, c, C.speed);
      speed = C.speed;
      turn = 1.6;
      if ((k.t -= DT) <= 0) tire(k, C.rest * 0.6);
    }
    if (speed > 0) {
      const off = angDiff(want, k.h);
      k.h += clamp(off, -turn * DT, turn * DT);
      // it turns before it goes: no sliding off sideways
      const go = speed * (Math.abs(off) > 1.2 ? 0.3 : 1);
      let nx = k.x + Math.cos(k.h) * go * DT;
      let ny = k.y + Math.sin(k.h) * go * DT;
      const rad = k.def.radius;
      for (const s of w.near(nx, ny, rad + 2, WALK_NEAR)) {
        const r = s.def.radius + rad;
        if (s.down || !s.def.solid || Math.abs(s.x - nx) > r || Math.abs(s.y - ny) > r) continue;
        const d = Math.hypot(nx - s.x, ny - s.y) || 1;
        if (d < r) {
          nx = s.x + ((nx - s.x) / d) * r;
          ny = s.y + ((ny - s.y) / d) * r;
          // blocked on a walk: think again
          if (k.state === 'walk') [k.tx, k.ty] = spot(w, k, D);
          // ran into it head down: that is the end of the charge
          if (k.state === 'charge') tire(k, D.charge!.rest);
        }
      }
      [nx, ny] = w.keepInside(nx, ny, rad);
      k.gait += Math.hypot(nx - k.x, ny - k.y);
      k.x = nx;
      k.y = ny;
    }
    if (D.kind === 'ground') for (const c of w.cars) meet(w, k, D, c);
  }
}

/** The heading that brings an animal running at `speed` to where this car will be. */
function aim(k: Critter, c: Car, speed: number): number {
  let t = 0;
  for (let i = 0; i < 3; i++)
    t = Math.min(1.2, Math.hypot(c.x + c.vx * t - k.x, c.y + c.vy * t - k.y) / speed);
  return Math.atan2(c.y + c.vy * t - k.y, c.x + c.vx * t - k.x);
}

/** The charge is over: it stands and gets its breath back. */
function tire(k: Critter, rest: number): void {
  k.state = 'idle';
  k.t = rest;
  k.blown = rest;
  k.prey = -1;
}

/**
 * An animal that attacks: picks out the nearest moving car within its notice, turns on it and
 * paws the ground. True while it is pawing (it does nothing else).
 */
function attack(
  w: World,
  k: Critter,
  D: CritterManifest,
  C: NonNullable<CritterManifest['charge']>,
): boolean {
  if (k.state === 'charge') return false;
  if (k.state === 'wind') {
    const c = w.cars[k.prey];
    if (!c || c.wrecked) {
      tire(k, 0.5);
      return true;
    }
    k.t -= DT;
    // it aims where the car will be when it gets there
    const want = aim(k, c, C.speed);
    k.h += clamp(angDiff(want, k.h), -9 * DT, 9 * DT);
    if (k.t <= 0) {
      k.state = 'charge';
      k.t = C.reach / C.speed;
      w.emit({
        t: 'critter',
        what: 'charge',
        critter: k.index,
        car: c.index,
        x: k.x,
        y: k.y,
        power: C.speed,
      });
    }
    return true;
  }
  if (k.blown > 0 || k.state === 'flee' || w.phase !== 'race') return false;
  let best: Car | null = null;
  let near = C.notice;
  for (const c of w.cars) {
    if (c.wrecked || c.z - c.deck > 7) continue;
    const d = Math.hypot(c.x - k.x, c.y - k.y);
    if (d < near && Math.hypot(c.vx, c.vy) > 25) {
      near = d;
      best = c;
    }
  }
  if (!best) return false;
  k.state = 'wind';
  k.t = C.wind;
  k.prey = best.index;
  w.emit({
    t: 'critter',
    what: 'wind',
    critter: k.index,
    car: best.index,
    x: k.x,
    y: k.y,
    power: C.wind,
  });
  return true;
}

/** A bird on the wing: it climbs, comes round over where it means to land, and glides down. */
function fly(w: World, k: Critter, D: CritterManifest): void {
  k.t -= DT;
  const dx = k.tx - k.x;
  const dy = k.ty - k.y;
  const d = Math.hypot(dx, dy);
  // time to come down: it turns in tight over its spot (wide circles would never reach it)
  const landing = k.t <= 0;
  const off = angDiff(Math.atan2(dy, dx), k.h);
  k.h += clamp(off, -(landing ? 7 : 2.4) * DT, (landing ? 7 : 2.4) * DT);
  const v = landing ? Math.max(16, D.run * Math.min(1, d / 50)) : D.run;
  k.x += Math.cos(k.h) * v * DT;
  k.y += Math.sin(k.h) * v * DT;
  k.gait += v * DT;
  const high = landing ? D.height * Math.min(1, d / 50) : D.height;
  k.z += clamp(high - k.z, -70 * DT, 55 * DT);
  if (landing && d < 3) {
    k.z = 0;
    k.state = 'idle';
    k.t = w.rng.range(1, 4);
    w.emit({ t: 'critter', what: 'down', critter: k.index, car: -1, x: k.x, y: k.y, power: 0 });
  }
}

/** A car and an animal on the ground. */
function meet(w: World, k: Critter, D: CritterManifest, c: Car): void {
  const far = k.def.radius + reach(c) + 2;
  if (Math.abs(c.x - k.x) > far || Math.abs(c.y - k.y) > far) return;
  // a car in the air goes over its head
  if (c.z - c.deck > 7 || c.deck > 4) return;
  {
    // where the animal stands against the car's hull: the way out of the car towards it
    const gap = pointGap(carShape(c, HULL), k.x, k.y, AT);
    const over = k.def.radius - gap;
    if (over <= 0) return;
    const nx = AT.nx;
    const ny = AT.ny;
    const px = AT.px;
    const py = AT.py;
    const closing = c.vx * nx + c.vy * ny;
    if (D.mass < FLUNG_BELOW) {
      if (closing > 30 && !c.wrecked) {
        // bowled over: thrown on ahead and a little to the side, the heavier the lower
        const side = w.rng.range(-0.5, 0.5);
        const up = clamp(60 + closing * 0.55, 70, 190) / (1 + D.mass);
        fling(
          w,
          k,
          c.vx * 0.85 - ny * closing * side,
          c.vy * 0.85 + nx * closing * side,
          up,
          c.index,
        );
        const keep = 1 - Math.min(0.3, D.mass * 0.45);
        c.vx *= keep;
        c.vy *= keep;
        if (D.points > 0) {
          c.score += D.points;
          w.emit({
            t: 'score',
            car: c.index,
            x: k.x,
            y: k.y,
            points: D.points,
            label: `+${D.points}`,
          });
        }
      } else {
        // nudged out of the way
        k.x += nx * over;
        k.y += ny * over;
      }
      return;
    }
    // too heavy to throw: the car is what gives way
    const share = clamp(1 / (1 + D.mass), 0.2, 0.6);
    c.x -= nx * over * (1 - share);
    c.y -= ny * over * (1 - share);
    k.x += nx * over * share;
    k.y += ny * over * share;
    if (k.state === 'charge' && D.charge) {
      // caught it: the car goes the way the animal was going, spinning
      const C = D.charge;
      const ax = Math.cos(k.h);
      const ay = Math.sin(k.h);
      c.vx = c.vx * 0.35 + ax * C.shove;
      c.vy = c.vy * 0.35 + ay * C.shove;
      c.spin += (w.rng.next() < 0.5 ? -1 : 1) * w.rng.range(2.5, 4.5);
      tire(k, C.rest);
      damage(w, c, C.hit, null, px, py);
      w.emit({
        t: 'critter',
        what: 'gore',
        critter: k.index,
        car: c.index,
        x: k.x,
        y: k.y,
        power: C.hit,
      });
      w.emit({
        t: 'crash',
        x: k.x - nx * k.def.radius,
        y: k.y - ny * k.def.radius,
        impact: C.shove,
        player: c === w.player,
      });
      return;
    }
    if (closing <= 0) return;
    c.vx -= nx * closing * 1.3;
    c.vy -= ny * closing * 1.3;
    c.spin += w.rng.range(-1, 1) * clamp(closing * 0.02, 0, 2.5);
    // and it is off, the way it was shoved
    if (D.charge) {
      // one that attacks does not run from a knock: it turns on whoever gave it
      if (k.state !== 'wind' && closing > 25) k.blown = 0;
    } else {
      k.h = Math.atan2(ny, nx);
      k.state = 'flee';
      k.t = 1.6;
    }
    if (closing > 25 && c.hitCd <= 0) {
      c.hitCd = 0.25;
      if (closing > 45 && !c.wrecked) damage(w, c, (closing - 35) * 0.2, null, px, py);
      w.emit({
        t: 'critter',
        what: 'bump',
        critter: k.index,
        car: c.index,
        x: k.x,
        y: k.y,
        power: closing,
      });
      w.emit({
        t: 'crash',
        x: k.x - nx * k.def.radius,
        y: k.y - ny * k.def.radius,
        impact: closing * 0.5,
        player: c === w.player,
      });
    }
    return;
  }
}
