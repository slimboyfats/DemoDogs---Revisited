import { DT } from '@demodogs/shared';
import type { Car } from './entities';
import type { World } from './world';

/** How long a car is down beside a raised road before it is lifted back onto it (s). */
export const RESCUE_AFTER = 2.5;
/** How high the road must stand over the car for that: lower, and its ramp is the way up. */
const HIGH = 8;
/** And how far from the road the car may be (px past the road's edge). */
const NEAR = 240;

/**
 * A raised road has walls for sides, so a car that goes over its edge can only get back by a
 * ramp at one of its ends, which may be far behind it. One that stays down beside the raised
 * road is lifted back onto it where it is, rolling.
 */
export function updateRescue(w: World, c: Car): void {
  const T = w.track;
  const R = w.relief;
  if (!T || !R?.plat || c.wrecked || c.finished || w.phase !== 'race') {
    c.downT = 0;
    return;
  }
  const i = c.idx;
  const top = R.platAt(T.x[i]!, T.y[i]!);
  const far = Math.hypot(c.x - T.x[i]!, c.y - T.y[i]!);
  const down = top >= HIGH && top - R.platAt(c.x, c.y) > HIGH * 0.75 && far < w.road / 2 + NEAR;
  if (!down) {
    c.downT = 0;
    return;
  }
  // (in the air on its way down it is not yet waiting)
  if (c.z > 2) return;
  c.downT += DT;
  if (c.downT < RESCUE_AFTER) return;
  const x = c.x;
  const y = c.y;
  w.placeOnTrack(c, i, 0);
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
  c.z = 6;
  c.deck = 0;
  c.downT = 0;
  c.invuln = Math.max(c.invuln, 1);
  w.emit({ t: 'rescue', car: c.index, x, y });
}
