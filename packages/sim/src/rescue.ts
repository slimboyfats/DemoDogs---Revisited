import { DT } from '@demodogs/shared';
import type { Car } from './entities';
import type { World } from './world';

/** How long a racing car may be off the course before the count starts, and how long the count is (s). */
export const RESCUE_GRACE = 1.5;
export const RESCUE_COUNT = 5;
/** How far past the road's edge still counts as on the course (px). */
const VERGE = 48;
/** How high raised road must stand over a car beside it for the car to be off it. */
const HIGH = 8;

/** Seconds left of the count before `c` is put back on the road, or 0 while none is running. */
export function rescueIn(c: Car): number {
  return c.downT > RESCUE_GRACE ? RESCUE_GRACE + RESCUE_COUNT - c.downT : 0;
}

/**
 * In a race a car that leaves the course has a while to find its own way back: over the grass,
 * or, below raised road (whose sides are walls), up a ramp at its end or a way up its side.
 * After RESCUE_GRACE off the course a count starts, shown to the player, and at its end the car
 * is put back on the nearest road it has already driven: never further on than where it left,
 * so there is nothing to gain by it.
 */
export function updateRescue(w: World, c: Car): void {
  const T = w.track;
  if (!T || w.kind !== 'race' || c.wrecked || c.finished || w.phase !== 'race') {
    c.downT = 0;
    return;
  }
  const i = c.idx;
  const R = w.relief;
  const top = R?.plat ? R.platAt(T.x[i]!, T.y[i]!) : 0;
  const below = top >= HIGH && top - R!.platAt(c.x, c.y) > HIGH * 0.75;
  const off = below || Math.hypot(c.x - T.x[i]!, c.y - T.y[i]!) > w.road / 2 + VERGE;
  if (!off) {
    c.downT = 0;
    c.onIdx = i;
    c.onLap = c.lap;
    return;
  }
  // (in the air it is not yet waiting)
  if (c.z > 2) return;
  c.downT += DT;
  if (c.downT < RESCUE_GRACE + RESCUE_COUNT) return;
  const x = c.x;
  const y = c.y;
  // the road beside it, unless that is further on than it has driven: then where it left
  const ahead = (c.lap - c.onLap) * T.n + i - c.onIdx > 2;
  if (ahead) c.lap = c.onLap;
  w.placeOnTrack(c, ahead ? c.onIdx : i, 0);
  for (
    let tries = 0;
    tries < 6 && w.cars.some((o) => o !== c && Math.hypot(o.x - c.x, o.y - c.y) < 18);
    tries++
  ) {
    c.x -= Math.cos(c.h) * 16;
    c.y -= Math.sin(c.h) * 16;
  }
  const v = 40;
  c.vx = Math.cos(c.h) * v;
  c.vy = Math.sin(c.h) * v;
  c.vz = c.spin = 0;
  c.deck = w.deckAt(c.idx);
  c.z = c.deck + 6;
  c.downT = 0;
  c.invuln = Math.max(c.invuln, 1);
  w.emit({ t: 'rescue', car: c.index, x, y });
}
