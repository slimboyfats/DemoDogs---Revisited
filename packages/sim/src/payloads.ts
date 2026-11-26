import type { Car, Rocket } from './entities';
import { hidden } from './guards';
import { angDiff } from './math';
import type { World } from './world';

/**
 * Rockets that do more than fly straight: ones that lock onto a rival at launch and chase it, and
 * ones that burst into a fan of bomblets. Both are switched on by fields on the weapon manifest
 * (`lock`, `cluster`), so the kernel never needs to know which weapon is which.
 */

/** On launch: pick the nearest running rival in the weapon's lock cone and remember it. */
export function lockOn(w: World, r: Rocket): void {
  const L = r.def.lock;
  if (!L) return;
  let best = -1;
  let bd = L.range;
  for (const c of w.cars) {
    // (not a car on another level: a flyover deck above it, or the road under it)
    if (c.index === r.owner || c.wrecked || c.invuln > 0 || Math.abs(c.deck - r.z) > 8) continue;
    if (hidden(c)) continue;
    const d = Math.hypot(c.x - r.x, c.y - r.y);
    if (d < bd && Math.abs(angDiff(Math.atan2(c.y - r.y, c.x - r.x), r.h)) < L.cone) {
      bd = d;
      best = c.index;
    }
  }
  if (best < 0 && L.road && w.kind === 'race' && w.track) {
    // nobody in its sights: the next car up the road, if that is not too far round
    const from = w.cars[r.owner]!;
    let gap = L.range * 2;
    for (const c of w.cars) {
      if (c.index === r.owner || c.wrecked || c.finished || c.invuln > 0 || hidden(c)) continue;
      const d = c.progress - from.progress;
      if (d > 0 && d < gap) {
        gap = d;
        best = c.index;
      }
    }
  }
  if (best >= 0) r.target = best;
}

/** How near its target a road-following rocket leaves the road and flies straight at it. */
const CLOSE = 130;

/**
 * Where a rocket locked onto `c` steers: at the car, or, for one that follows the road
 * (`lock.road`) while the car is still a way off, at the road ahead of itself.
 */
export function aimAt(w: World, r: Rocket, c: Car, out: { x: number; y: number }): void {
  out.x = c.x;
  out.y = c.y;
  const T = w.track;
  if (!T || r.idx === undefined || !r.def.lock?.road) return;
  if (Math.hypot(c.x - r.x, c.y - r.y) < CLOSE) return;
  let i = r.idx;
  for (let k = 0; k < 8; k++) {
    const j = (i + 1) % T.n;
    if (Math.hypot(T.x[j]! - r.x, T.y[j]! - r.y) > Math.hypot(T.x[i]! - r.x, T.y[i]! - r.y)) break;
    i = j;
  }
  r.idx = i;
  // (once it is past the car it turns and flies at it)
  if ((((T.s[c.idx]! - T.s[i]!) % T.len) + T.len) % T.len > T.len / 2) return;
  const j = (i + Math.ceil(44 / T.step)) % T.n;
  out.x = T.x[j]!;
  out.y = T.y[j]!;
}

/** The car a rocket is locked onto, while that car is still running; the lock drops otherwise. */
export function lockedOn(w: World, r: Rocket): Car | null {
  if (r.target === undefined) return null;
  const c = w.cars[r.target];
  if (c && !c.wrecked && !hidden(c)) return c;
  delete r.target;
  return null;
}

/** A cluster rocket bursts: its bomblets fan out ahead from where it was. */
export function burst(w: World, r: Rocket): void {
  const C = r.def.cluster;
  if (!C) return;
  const b = w.content.weapon.get(C.bomblet);
  if (!b) return;
  for (let i = 0; i < C.count; i++) {
    const f = C.count > 1 ? i / (C.count - 1) - 0.5 : 0;
    w.rockets.push({
      x: r.x,
      y: r.y,
      z: r.z,
      h: r.h + f * C.spread + w.rng.range(-0.1, 0.1),
      v: (b.speed ?? 160) * w.rng.range(0.6, 1.15),
      owner: r.owner,
      life: (b.life ?? 0.5) * w.rng.range(0.6, 1),
      def: b,
      age: 0,
    });
  }
}
