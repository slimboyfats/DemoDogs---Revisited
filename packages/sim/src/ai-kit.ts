import type { Controls } from '@demodogs/shared';
import { DT } from '@demodogs/shared';
import type { Car } from './entities';
import type { World } from './world';

/**
 * Helpers for AI behaviours (content). They only read the world, except `unstick`, which keeps the
 * car's own AiState.
 */

/** If the car has been pushing against something, back off and turn for a moment. */
export function unstick(c: Car, out: Controls): Controls {
  const ai = c.ai!;
  if (ai.revT > 0) {
    ai.revT -= DT;
    return { steer: -out.steer || 1, throttle: 0, brake: true, boost: false, fire: false };
  }
  if (out.throttle > 0.5 && Math.abs(c.vf) < 12) {
    ai.stuckT += DT;
    if (ai.stuckT > 0.9) {
      ai.stuckT = 0;
      ai.revT = 0.8;
    }
  } else ai.stuckT = Math.max(0, ai.stuckT - DT);
  return out;
}

/** The nearest other running car for which `ok` holds, and its distance. */
export function nearestCar(
  w: World,
  c: Car,
  maxDist: number,
  ok: (o: Car, d: number) => boolean,
): [Car | null, number] {
  let best: Car | null = null;
  let bd = maxDist;
  for (const o of w.cars) {
    if (o === c || o.wrecked) continue;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d < bd && ok(o, d)) {
      bd = d;
      best = o;
    }
  }
  return [best, bd];
}

/** Steer towards (x, y): -1 to 1, and the angle still to turn. */
export function steerTo(c: Car, x: number, y: number, gain = 2.6): [number, number] {
  let d = (Math.atan2(y - c.y, x - c.x) - c.h) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return [Math.max(-1, Math.min(1, d * gain)), d];
}
