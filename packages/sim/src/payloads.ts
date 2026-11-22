import type { Car, Rocket } from './entities';
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
    if (c.index === r.owner || c.wrecked || c.invuln > 0) continue;
    const d = Math.hypot(c.x - r.x, c.y - r.y);
    if (d < bd && Math.abs(angDiff(Math.atan2(c.y - r.y, c.x - r.x), r.h)) < L.cone) {
      bd = d;
      best = c.index;
    }
  }
  if (best >= 0) r.target = best;
}

/** The car a rocket is locked onto, while that car is still running; the lock drops otherwise. */
export function lockedOn(w: World, r: Rocket): Car | null {
  if (r.target === undefined) return null;
  const c = w.cars[r.target];
  if (c && !c.wrecked) return c;
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
      h: r.h + f * C.spread + w.rng.range(-0.1, 0.1),
      v: (b.speed ?? 160) * w.rng.range(0.6, 1.15),
      owner: r.owner,
      life: (b.life ?? 0.5) * w.rng.range(0.6, 1),
      def: b,
      age: 0,
    });
  }
}
