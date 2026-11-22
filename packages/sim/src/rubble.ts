import type { StaticProp } from './entities';
import { TAU } from './math';
import { stand } from './stand';
import type { World } from './world';

/**
 * A piece of scenery that has come down leaves rubble, as its manifest says: static pieces that
 * land towards the road (a crumbling cliff drops a rockfall into the lane beside it). None lands
 * on a car, and none outside the world.
 */
export function tumble(w: World, s: StaticProp): void {
  const R = s.def.rubble;
  if (!R) return;
  const def = w.content.prop.get(R.prop);
  if (!def || def.body !== 'static') return;
  let dx = 0;
  let dy = 0;
  const T = w.track;
  if (T && R.reach > 0) {
    // towards the nearest point of the road's centre line
    let best = Infinity;
    for (let i = 0; i < T.n; i += 2) {
      const d = (T.x[i]! - s.x) ** 2 + (T.y[i]! - s.y) ** 2;
      if (d < best) {
        best = d;
        dx = T.x[i]! - s.x;
        dy = T.y[i]! - s.y;
      }
    }
    const d = Math.sqrt(best) || 1;
    const go = Math.min(R.reach, d);
    dx = (dx / d) * go;
    dy = (dy / d) * go;
  }
  for (let k = 0; k < R.n; k++) {
    if (w.rng.next() >= R.chance) continue;
    const a = w.rng.next() * TAU;
    const r = w.rng.next() * R.spread;
    const f = 0.6 + w.rng.next() * 0.4;
    const x = s.x + dx * f + Math.cos(a) * r;
    const y = s.y + dy * f + Math.sin(a) * r;
    const rot = w.rng.next() * TAU;
    if (x < 12 || y < 12 || x > w.w - 12 || y > w.h - 12) continue;
    if (w.cars.some((c) => Math.hypot(c.x - x, c.y - y) < def.radius + 14)) continue;
    stand(w, def, x, y, rot, k);
  }
}
