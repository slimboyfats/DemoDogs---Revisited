import type { Car, World } from '@demodogs/sim';
import { rangeGive } from '@demodogs/sim';
import { loadContent } from './index';
import { flatBench, put } from './testing';

/**
 * An empty arena for trying a guard: the player (`me`) in the middle facing +x, and two parked
 * rivals (`a`, `b`) that nobody drives, far out of the way until a test puts them somewhere.
 */
export function guardArena(): { w: World; me: Car; a: Car; b: Car; x: number; y: number } {
  const w = flatBench({ rivals: 2 });
  w.pickups.length = 0;
  const me = w.player;
  const [a, b] = w.cars.filter((c) => c !== me) as [Car, Car];
  a.ai = b.ai = null;
  const x = w.oval!.cx - 100;
  const y = w.oval!.cy;
  put(me, x, y, 0);
  put(a, w.oval!.cx + 260, w.oval!.cy + 240, 0);
  put(b, w.oval!.cx + 260, w.oval!.cy - 240, 0);
  // nobody's gun goes off unless a test loads it
  for (const c of w.cars) c.rounds = 0;
  w.takeEvents();
  return { w, me, a, b, x, y };
}

/** Hand car `c` pickup `id`. */
export function give(w: World, c: Car, id: string): void {
  rangeGive(w, c, loadContent().pickup.get(id)!);
}

/** The crate that holds `id`, and every venue it is in. */
export function inTheKit(id: string): boolean {
  const C = loadContent();
  const kits = [...C.pickup.values()].filter((p) => p.kits?.includes(id));
  return (
    kits.length > 0 &&
    [...C.venue.values()].every((v) => kits.some((k) => v.pickups.includes(k.id)))
  );
}
